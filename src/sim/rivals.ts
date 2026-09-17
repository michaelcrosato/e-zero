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
import { BASE, RACE_DISTANCE, widthAt } from '../track/layout';
import { total } from '../track/spline';
import { shipPalettes } from '../render/palettes';
import { game, player } from './state';
import type { Rival } from './types';

/** Starting grid: three staggered columns leave gaps to pass through. */
const COLUMN_LANES = [-0.7, 0, 0.7];
/** Irrational-ish step so idle weave never synchronises across the field. */
const PHASE_STEP = 2.399963;

function build(): Rival[] {
  return Array.from({ length: FIELD_SIZE - 1 }, (_, i) => {
    const row = Math.floor(i / 3);
    const column = i % 3;
    const startS = 96 + row * 79 + column * 12;
    const lane = COLUMN_LANES[column];
    const phase = i * PHASE_STEP;
    // Rivals further up the grid are quicker, so the field is a real ladder.
    const level = i / (FIELD_SIZE - 2);
    const pace = 0.94 + level * 0.155 + Math.sin(i * 3.71) * 0.018;
    const x = lane * (widthAt(startS) - 24);
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

export const rivals: Rival[] = build();

export function resetRivals(): void {
  for (const r of rivals) {
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

/**
 * Decides throttle and lane for every rival.
 *
 * Runs at 8 Hz rather than every step: it sorts the whole field by lap distance
 * and scans a window of neighbours, which is far too costly at 120 Hz and does
 * not need that resolution to look right.
 */
export function planTraffic(): void {
  const pack: PackEntry[] = rivals.map((r) => ({ r, s: mod(r.s, total), x: r.x, v: r.v }));
  pack.push({ r: null, s: mod(player.s, total), x: player.x, v: player.v });
  pack.sort((a, b) => a.s - b.s);

  for (let i = 0; i < pack.length; i++) {
    const entry = pack[i];
    const r = entry.r;
    if (!r) continue;

    const near: Array<{ ds: number; x: number; v: number }> = [];
    for (let k = -9; k <= 9; k++) {
      if (k === 0) continue;
      const q = pack[mod(i + k, pack.length)];
      const ds = mod(q.s - entry.s + total / 2, total) - total / 2;
      if (Math.abs(ds) < 255) near.push({ ds, x: q.x, v: q.v });
    }

    const lead = near
      .filter((q) => q.ds > 0 && q.ds < 185 && Math.abs(q.x - r.x) < 32)
      .sort((a, b) => a.ds - b.ds)[0];

    r.traffic = 1;
    if (lead && game.fieldTime > 1) {
      const cruise = BASE * r.pace * (r.boosting ? r.boostRatio : 1);
      r.traffic = clamp((lead.v + Math.max(0, lead.ds - 52) * 2.2) / cruise, 0.38, 1);

      if (r.laneHold <= 0) {
        const limit = widthAt(r.s + 100) - 26;
        const candidates = [-0.76, -0.38, 0, 0.38, 0.76];
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
  game.fieldTime += dt;
  game.trafficClock -= dt;
  if (game.trafficClock <= 0) {
    game.trafficClock = PLAN_INTERVAL;
    planTraffic();
  }

  for (const r of rivals) {
    const old = r.s;
    const limit = widthAt(r.s) - 24;
    r.laneHold = Math.max(0, r.laneHold - dt);

    // Wide sections give the pack more room; narrow ones squeeze it back in.
    const target = clamp(
      r.targetLane * limit + Math.sin(r.s * 0.0018 + r.phase) * 4,
      -limit,
      limit,
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
    r.s += r.v * dt;

    // Interpolate the exact crossing time so finish order is not step-quantised.
    if (old < RACE_DISTANCE && r.s >= RACE_DISTANCE && r.finishedAt === null)
      r.finishedAt = game.fieldTime - dt + (RACE_DISTANCE - old) / Math.max(1, r.v);
  }
}
