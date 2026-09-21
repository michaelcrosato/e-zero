import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_STEP, HALF } from '../../src/config/constants';
import {
  course,
  courseBaseSpeed,
  courseMaxSpeed,
  courseLength,
  courseWidthAt,
  raceDistance,
} from '../../src/track/course';
import {
  GRID_COLUMNS,
  MERGE_START,
  MERGE_END,
  skylineDividerAt,
  skylineGrid,
  skylineLaneCountAt,
  skylineLaneUnitsAt,
  skylineWidthAt,
} from '../../src/track/launch';
import { skyline, sectionAt } from '../../src/track/spatial';
import { total as classicLength } from '../../src/track/spline';
import { BASE, MAX } from '../../src/track/layout';
import { resetRivals, rivals, updateRivals } from '../../src/sim/rivals';
import { game, player } from '../../src/sim/state';

afterEach(() => {
  course.id = 'classic';
  resetRivals();
});

describe('nine-lane twelve-section circuit', () => {
  it('keeps the longer circuit and doubles Skyline cruise and boost speeds only', () => {
    expect(courseBaseSpeed()).toBe(BASE);
    expect(courseMaxSpeed()).toBe(MAX);
    course.id = 'skyline';
    expect(courseLength()).toBe(classicLength * 2);
    expect(raceDistance()).toBe(skyline.length * 3);
    expect(BASE).toBe(classicLength / 29.7);
    expect(courseBaseSpeed()).toBe(BASE * 2);
    expect(courseMaxSpeed()).toBe(MAX * 2);
    expect(courseLength() / courseBaseSpeed()).toBeCloseTo(29.7, 10);
    expect(skyline.sections).toHaveLength(12);
    expect(new Set(skyline.sections.map((s) => s.name)).size).toBe(12);
    for (const s of skyline.sections) expect(s.end - s.start).toBeGreaterThan(1500);
    // Doubling speed halves the time to the existing merge; its geometry is unchanged.
    expect(MERGE_END / courseBaseSpeed()).toBeGreaterThan(12.5);
    course.id = 'classic';
    expect(courseBaseSpeed()).toBe(BASE);
    expect(courseMaxSpeed()).toBe(MAX);
  });

  it('accelerates the entire Skyline field at twice the Classic pace', () => {
    const step = (id: 'classic' | 'skyline') => {
      course.id = id;
      resetRivals();
      game.fieldTime = 0;
      game.trafficClock = 0;
      player.s = -1000;
      player.v = 0;
      updateRivals(FIXED_STEP);
      return rivals.map((r) => ({ v: r.v, travelled: r.s - r.startS }));
    };
    const classic = step('classic');
    const skyline = step('skyline');
    skyline.forEach((r, i) => {
      expect(r.v).toBeCloseTo(classic[i].v * 2, 10);
      expect(r.travelled).toBeCloseTo(classic[i].travelled * 2, 10);
    });
  });

  it('holds nine lanes for the whole grid and removes exactly one lane in each of sections 1–6', () => {
    for (let s = 0; s <= MERGE_START; s += 20) {
      expect(skylineWidthAt(s)).toBe(HALF * 3);
      expect(skylineLaneCountAt(s)).toBe(9);
    }
    let previous = 9;
    for (let s = 0; s < MERGE_END; s += 10) {
      expect(skylineLaneUnitsAt(s)).toBeLessThanOrEqual(previous);
      previous = skylineLaneUnitsAt(s);
    }
    for (const part of skyline.sections.slice(0, 6)) {
      const start = Math.max(0, part.start + 0.01);
      expect(skylineLaneCountAt(start)).toBe(10 - part.index);
      expect(skylineLaneCountAt(part.end - 0.01)).toBe(9 - part.index);
      expect(
        Array.from({ length: 8 }, (_, i) => skylineDividerAt(part.end - 0.01, i)).filter(
          (line) => line.opacity > 0,
        ),
      ).toHaveLength(8 - part.index);
    }
  });

  it('uses three to six lanes for all of the last six sections with room for difficult features', () => {
    const last = skyline.sections.slice(6);
    expect(last.map((s) => s.lanes)).toEqual([6, 4, 5, 4, 3, 6]);
    for (const part of last) {
      for (let s = part.start; s < part.end; s += 7) {
        expect(skylineLaneUnitsAt(s)).toBeGreaterThanOrEqual(3);
        expect(skylineLaneUnitsAt(s)).toBeLessThanOrEqual(6);
      }
      expect(skylineLaneCountAt((part.start + part.end) / 2)).toBe(part.lanes);
    }
    expect(sectionAt(skyline.length - 1).index).toBe(1);
  });

  it('wraps and crosses section boundaries without abrupt changes in width or lane markings', () => {
    for (let s = -skyline.length; s < skyline.length * 2; s += 23) {
      expect(skylineWidthAt(s)).toBeCloseTo(skylineWidthAt(s + skyline.length * 3), 8);
      expect(Math.abs(skylineWidthAt(s + 1) - skylineWidthAt(s))).toBeLessThan(0.15);
      for (let divider = 0; divider < 8; divider++) {
        const line = skylineDividerAt(s, divider);
        if (line.opacity > 0) expect(Math.abs(line.x)).toBeLessThan(skylineWidthAt(s));
      }
    }
    for (const part of skyline.sections)
      expect(skylineWidthAt(part.end - 0.001)).toBeCloseTo(skylineWidthAt(part.end + 0.001), 5);
    expect(skylineWidthAt(-0.01)).toBeCloseTo(skylineWidthAt(0.01), 6);
  });

  it('uses nine separated columns with generous row spacing before the first merge', () => {
    const grid = Array.from({ length: 99 }, (_, i) => skylineGrid(i));
    expect(new Set(grid.map((r) => r.x)).size).toBe(GRID_COLUMNS);
    expect(grid[9].s - grid[0].s).toBe(237);
    expect(Math.max(...grid.map((r) => r.s))).toBeLessThan(MERGE_START);
    for (let i = 0; i < grid.length; i++) {
      expect(Math.abs(grid[i].x) + 24).toBeLessThan(skylineWidthAt(grid[i].s));
      for (let j = i + 1; j < grid.length; j++)
        if (Math.abs(grid[i].s - grid[j].s) < 65)
          expect(Math.abs(grid[i].x - grid[j].x)).toBeGreaterThan(60);
    }
  });

  it('restores Classic length, grid and width after switching courses', () => {
    const classic = rivals.map((r) => ({ s: r.s, x: r.x, lane: r.lane }));
    course.id = 'skyline';
    resetRivals();
    expect(new Set(rivals.map((r) => r.x)).size).toBe(9);
    expect(courseWidthAt(0)).toBe(294);
    course.id = 'classic';
    resetRivals();
    expect(rivals.map((r) => ({ s: r.s, x: r.x, lane: r.lane }))).toEqual(classic);
    expect(courseWidthAt(0)).toBe(98);
    expect(courseLength()).toBe(classicLength);
    expect(raceDistance()).toBe(classicLength * 3);
  });

  it('drives all 99 rivals around the longer circuit inside the rails without lateral jumps', () => {
    course.id = 'skyline';
    resetRivals();
    game.fieldTime = 0;
    game.trafficClock = 0;
    player.s = -1000;
    player.x = 0;
    player.v = 0;
    let maxStep = 0;
    let largestMove = {};
    let minClearance = Infinity;
    for (let tick = 0; tick < 75 / FIXED_STEP; tick++) {
      const positions = rivals.map((r) => r.x);
      updateRivals(FIXED_STEP);
      rivals.forEach((r, i) => {
        if (Math.abs(r.x - positions[i]) > maxStep)
          largestMove = {
            id: r.id,
            s: r.s,
            from: positions[i],
            to: r.x,
            lane: r.targetLane,
            v: r.v,
          };
        maxStep = Math.max(maxStep, Math.abs(r.x - positions[i]));
        minClearance = Math.min(minClearance, skylineWidthAt(r.s) - Math.abs(r.x));
        if (r.s < raceDistance()) expect(r.finishedAt).toBeNull();
      });
    }
    expect(rivals.every((r) => r.s > skyline.length)).toBe(true);
    expect(minClearance).toBeGreaterThan(22);
    expect(maxStep, JSON.stringify(largestMove)).toBeLessThanOrEqual(60 * FIXED_STEP + 1e-8);
  }, 30_000);
});
