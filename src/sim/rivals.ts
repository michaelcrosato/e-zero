/**
 * The 99 computer rivals.
 *
 * Each rival has a fixed pace, lane preference and boost schedule decided at
 * build time, so the field is identical every race and nothing teleports to
 * keep it close. Overtaking comes from the traffic planner below, which is the
 * only part that reacts to where everyone actually is.
 */
import { FIELD_SIZE } from '../config/constants';
import { clamp, lerp, mod } from '../core/math';
import { BASE } from '../track/layout';
import {
  course,
  sampleCourse,
  gradeAcceleration,
  courseWidthAt as widthAt,
  courseLength,
  raceDistance,
} from '../track/course';
import { skylineGrid, skylineLaneAt, GRID_COLUMNS } from '../track/launch';
import { shipPalettes } from '../render/palettes';
import { game, player } from './state';
import type { Rival } from './types';
import { online, onlinePosition } from '../online/state';

/** Classic retains its original three-column grid. Skyline uses nine. */
const COLUMN_LANES = [-0.7, 0, 0.7];
/** Irrational-ish step so idle weave never synchronises across the field. */
const PHASE_STEP = 2.399963;

function build(): Rival[] {
  return Array.from({ length: FIELD_SIZE - 1 }, (_, i) => {
    const { s: startS, x, lane } = grid(i);
    const phase = i * PHASE_STEP;
    // Rivals further up the grid are quicker, so the field is a real ladder.
    const level = i / (FIELD_SIZE - 2);
    const pace = 0.94 + level * 0.155 + Math.sin(i * 3.71) * 0.018;
    return {
      id: i + 1,
      name: 'RACER ' + String(i + 1).padStart(2, '0'),
      startS,
      s: startS,
      x,
      baseX: x,
      lane,
      targetLane: lane,
      v: 0,
      pace,
      color: 1 + ((i * 7) % (shipPalettes.length - 1)),
      phase,
      acceleration: 3.4 + (i % 7) * 0.16,
      traffic: 1,
      laneHold: 0,
      finishedAt: null,
      boosting: false,
      boostRatio: 1.35 + level * 0.58,
      boostPeriod: 10.1 + (i % 5) * 0.25,
      boostDuration: 1.1 + level * 2.4,
      launchBoost: 0.9 + level * 5.9,
    };
  });
}

function grid(index: number): { s: number; x: number; lane: number } {
  if (course.id === 'skyline') return skylineGrid(index);
  const column = index % 3;
  const s = 96 + Math.floor(index / 3) * 79 + column * 12;
  const lane = COLUMN_LANES[column];
  return { s, x: lane * (widthAt(s) - 24), lane };
}

export const rivals: Rival[] = build();

export function resetRivals(): void {
  for (const r of rivals) {
    const start = grid(r.id - 1);
    r.startS = start.s;
    r.baseX = start.x;
    r.lane = start.lane;
    r.s = r.startS;
    r.x = r.baseX;
    r.v = 0;
    r.targetLane = r.lane;
    r.traffic = 1;
    r.laneHold = 0;
    r.finishedAt = null;
    r.boosting = false;
  }
}

/** Race position, counting rivals that have already finished as ahead. */
export function livePosition(): number {
  if (online.racing) return onlinePosition();
  return 1 + rivals.reduce((n, r) => n + (r.finishedAt !== null || r.s > player.s ? 1 : 0), 0);
}

/** Position by road order only, used in free drive where finishing is moot. */
export function roadPosition(): number {
  return 1 + rivals.reduce((n, r) => n + (r.s > player.s ? 1 : 0), 0);
}

interface PackEntry {
  r: Rival | null;
  s: number;
  x: number;
  v: number;
}

function projectedLaneX(entry: PackEntry): number {
  const ahead = entry.s + entry.v * 0.75;
  const lane = entry.x / (widthAt(entry.s) - 24);
  const change = entry.r
    ? skylineLaneAt(ahead, (entry.r.id - 1) % GRID_COLUMNS) -
      skylineLaneAt(entry.s, (entry.r.id - 1) % GRID_COLUMNS)
    : 0;
  return (lane + change) * (widthAt(ahead) - 24);
}

/**
 * Decides throttle and lane for every rival.
 *
 * Runs at 8 Hz rather than every step: it sorts the whole field by lap distance
 * and scans a window of neighbours, which is far too costly at 120 Hz and does
 * not need that resolution to look right.
 */
export function planTraffic(): void {
  const total = courseLength();
  const pack: PackEntry[] = rivals.map((r) => ({ r, s: mod(r.s, total), x: r.x, v: r.v }));
  pack.push({ r: null, s: mod(player.s, total), x: player.x, v: player.v });
  pack.sort((a, b) => a.s - b.s);

  for (let i = 0; i < pack.length; i++) {
    const entry = pack[i];
    const r = entry.r;
    if (!r) continue;

    const spatial = course.id === 'skyline';
    const nextX = spatial ? projectedLaneX(entry) : r.x;
    const near: Array<{ ds: number; x: number; nextX: number; v: number }> = [];
    const neighbours = spatial ? 27 : 9;
    for (let k = -neighbours; k <= neighbours; k++) {
      if (k === 0) continue;
      const q = pack[mod(i + k, pack.length)];
      const ds = mod(q.s - entry.s + total / 2, total) - total / 2;
      if (Math.abs(ds) < 255)
        near.push({ ds, x: q.x, nextX: spatial ? projectedLaneX(q) : q.x, v: q.v });
    }

    const lead = near
      .filter(
        (q) =>
          q.ds > 0 &&
          q.ds < (spatial ? 240 : 185) &&
          (spatial
            ? Math.abs(q.x - r.x) < 52 || Math.abs(q.nextX - nextX) < 52
            : Math.abs(q.x - r.x) < 32),
      )
      .sort((a, b) => a.ds - b.ds)[0];

    r.traffic = 1;
    if (lead && game.fieldTime > 1) {
      const cruise = BASE * r.pace * (r.boosting ? r.boostRatio : 1);
      // Anticipate a disappearing lane and leave a craft-length gap before merging.
      r.traffic = clamp(
        (lead.v + Math.max(0, lead.ds - (spatial ? 82 : 52)) * 2.2) / cruise,
        0.38,
        1,
      );

      if (r.laneHold <= 0) {
        const limit = widthAt(r.s + 100) - 26;
        const candidates = spatial
          ? Array.from({ length: GRID_COLUMNS }, (_, column) => skylineLaneAt(r.s + 100, column))
          : [-0.76, -0.38, 0, 0.38, 0.76];
        let bestLane = r.targetLane;
        let bestScore = -Infinity;
        for (const lane of candidates) {
          const x = lane * limit;
          let score = 180 - Math.abs(x - r.x) * 0.72;
          for (const q of near) {
            if (Math.abs(q.x - x) < 35) {
              if (q.ds > 0) score -= Math.max(0, 200 - q.ds) * 1.5;
              else if (q.ds > -72) score -= 210;
            }
            // Do not move sideways through a vehicle alongside.
            if (Math.abs(q.ds) < 42 && q.x > Math.min(x, r.x) - 27 && q.x < Math.max(x, r.x) + 27)
              score -= 360;
          }
          if (score > bestScore) {
            bestScore = score;
            bestLane = lane;
          }
        }
        if (Math.abs(bestLane - r.targetLane) > 0.1) {
          r.targetLane = bestLane;
          r.laneHold = 0.7 + (r.id % 5) * 0.14;
        }
      }
    } else if (r.laneHold <= 0) {
      r.targetLane = r.lane;
      r.laneHold = 1.2 + (r.id % 6) * 0.13;
    }
  }
}

/** Traffic replan interval, in seconds. */
const PLAN_INTERVAL = 0.12;

export function updateRivals(dt: number): void {
  if (online.racing) return;
  const RACE_DISTANCE = raceDistance();
  game.fieldTime += dt;
  game.trafficClock -= dt;
  if (game.trafficClock <= 0) {
    game.trafficClock = PLAN_INTERVAL;
    planTraffic();
  }

  for (const r of rivals) {
    const old = r.s;
    const limit = widthAt(r.s) - 24;
    if (course.id === 'skyline') {
      const lane = skylineLaneAt(r.s, (r.id - 1) % GRID_COLUMNS);
      if (Math.abs(r.targetLane - r.lane) < 1e-6) r.targetLane = lane;
      r.lane = lane;
    }
    r.laneHold = Math.max(0, r.laneHold - dt);

    // Look into the taper early enough to steer inward, rather than snapping at its rail.
    const targetLimit =
      course.id === 'skyline'
        ? Math.min(limit, widthAt(r.s + Math.max(120, r.v * 0.5)) - 24)
        : limit;
    // Wide sections give the pack more room; narrow ones squeeze it back in.
    const target = clamp(
      r.targetLane * targetLimit + Math.sin(r.s * 0.0018 + r.phase) * 4,
      -targetLimit,
      targetLimit,
    );
    r.x = clamp(r.x + clamp(target - r.x, -60 * dt, 60 * dt), -limit, limit);

    const pulse = 1 + Math.sin(game.fieldTime * 0.55 + r.phase) * 0.02;
    // Fixed boost plans keep the front of the field competitive.
    const boostAge = mod(game.fieldTime - r.launchBoost + 3.8 + (r.id % 7) * 0.43, r.boostPeriod);
    r.boosting =
      game.fieldTime > 0.28 &&
      (game.fieldTime < r.launchBoost ||
        (game.fieldTime > r.launchBoost + 1.8 && boostAge < r.boostDuration));

    const targetV = BASE * r.pace * pulse * (r.boosting ? r.boostRatio : 1) * r.traffic;
    r.v = lerp(r.v, targetV, 1 - Math.exp(-dt * (targetV < r.v ? 5 : r.acceleration)));
    if (course.id === 'skyline') r.v = Math.max(0, r.v + gradeAcceleration(sampleCourse(r.s)) * dt);
    r.s += r.v * dt;

    // Interpolate the exact crossing time so finish order is not step-quantised.
    if (old < RACE_DISTANCE && r.s >= RACE_DISTANCE && r.finishedAt === null)
      r.finishedAt = game.fieldTime - dt + (RACE_DISTANCE - old) / Math.max(1, r.v);
  }
}
