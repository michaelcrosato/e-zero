import { afterEach, describe, expect, it } from 'vitest';
import { FIXED_STEP, HALF } from '../../src/config/constants';
import { course, courseWidthAt } from '../../src/track/course';
import {
  MERGE_START,
  MERGE_END,
  skylineDividerAt,
  skylineGrid,
  skylineLaneCountAt,
  skylineWidthAt,
} from '../../src/track/launch';
import { total } from '../../src/track/spline';
import { resetRivals, rivals, updateRivals } from '../../src/sim/rivals';
import { game, player } from '../../src/sim/state';

afterEach(() => {
  course.id = 'classic';
  resetRivals();
});

describe('six-lane launch', () => {
  it('doubles the entire starting apron then progressively drops to five, four and three lanes', () => {
    for (let s = 0; s <= MERGE_START; s += 20) {
      expect(skylineWidthAt(s)).toBe(HALF * 2);
      expect(skylineLaneCountAt(s)).toBe(6);
    }
    let previous = HALF * 2;
    for (let s = MERGE_START; s <= MERGE_END; s += 10) {
      expect(skylineWidthAt(s)).toBeLessThanOrEqual(previous);
      previous = skylineWidthAt(s);
    }
    for (let stage = 1; stage <= 3; stage++) {
      const s = MERGE_START + ((MERGE_END - MERGE_START) * stage) / 3 + 0.001;
      expect(skylineLaneCountAt(s)).toBe(6 - stage);
      expect(skylineWidthAt(s)).toBeCloseTo((HALF * (6 - stage)) / 3, 5);
      expect(
        Array.from({ length: 5 }, (_, i) => skylineDividerAt(s, i)).filter((x) => x !== null),
      ).toHaveLength(5 - stage);
    }
  });

  it('wraps at every lap without a discontinuity or an abrupt narrowing edge', () => {
    for (let s = -total; s <= total * 2; s += 23) {
      expect(skylineWidthAt(s)).toBeCloseTo(skylineWidthAt(s + total * 3), 8);
      expect(Math.abs(skylineWidthAt(s + 1) - skylineWidthAt(s))).toBeLessThan(0.15);
      for (let divider = 0; divider < 5; divider++) {
        const x = skylineDividerAt(s, divider);
        if (x !== null) expect(Math.abs(x)).toBeLessThan(skylineWidthAt(s));
      }
    }
    expect(skylineWidthAt(-0.01)).toBe(skylineWidthAt(0.01));
  });

  it('uses six separated columns, twice the row spacing and fits the whole field before the taper', () => {
    const grid = Array.from({ length: 99 }, (_, i) => skylineGrid(i));
    expect(new Set(grid.map((r) => r.x)).size).toBe(6);
    expect(grid[6].s - grid[0].s).toBe(158);
    expect(Math.max(...grid.map((r) => r.s))).toBeLessThan(MERGE_START);
    for (let i = 0; i < grid.length; i++) {
      expect(Math.abs(grid[i].x) + 24).toBeLessThan(skylineWidthAt(grid[i].s));
      for (let j = i + 1; j < grid.length; j++)
        if (Math.abs(grid[i].s - grid[j].s) < 65)
          expect(Math.abs(grid[i].x - grid[j].x)).toBeGreaterThan(60);
    }
  });

  it('rebuilds the grid on course changes and restores Classic exactly', () => {
    const classic = rivals.map((r) => ({ s: r.s, x: r.x, lane: r.lane }));
    course.id = 'skyline';
    resetRivals();
    expect(new Set(rivals.map((r) => r.x)).size).toBe(6);
    expect(courseWidthAt(0)).toBe(196);
    course.id = 'classic';
    resetRivals();
    expect(rivals.map((r) => ({ s: r.s, x: r.x, lane: r.lane }))).toEqual(classic);
    expect(courseWidthAt(0)).toBe(98);
  });

  it('drives all 99 rivals through the merges inside the rails without lateral jumps', () => {
    course.id = 'skyline';
    resetRivals();
    game.fieldTime = 0;
    game.trafficClock = 0;
    player.s = -1000;
    player.x = 0;
    player.v = 0;
    let maxStep = 0;
    let minClearance = Infinity;
    for (let tick = 0; tick < 16 / FIXED_STEP; tick++) {
      const positions = rivals.map((r) => r.x);
      updateRivals(FIXED_STEP);
      rivals.forEach((r, i) => {
        maxStep = Math.max(maxStep, Math.abs(r.x - positions[i]));
        minClearance = Math.min(minClearance, skylineWidthAt(r.s) - Math.abs(r.x));
      });
    }
    expect(rivals.every((r) => r.s > MERGE_END)).toBe(true);
    expect(minClearance).toBeGreaterThan(22);
    expect(maxStep).toBeLessThanOrEqual(60 * FIXED_STEP + 1e-8);
  });
});
