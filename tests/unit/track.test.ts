import { describe, expect, it } from 'vitest';
import { HALF, RACE_LAPS } from '../../src/config/constants';
import { mod } from '../../src/core/math';
import { BASE, MAX, RACE_DISTANCE, pads, repair, repairX, widthAt } from '../../src/track/layout';
import { N, sample, total, track } from '../../src/track/spline';

describe('track spline', () => {
  it('builds a closed course of a plausible length', () => {
    expect(track.length).toBe(N);
    expect(N).toBeGreaterThan(1000);
    expect(total).toBeGreaterThan(0);
    expect(Number.isFinite(total)).toBe(true);
  });

  it('is resampled at uniform arc length', () => {
    const spacing: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = track[i];
      const b = track[(i + 1) % N];
      spacing.push(Math.hypot(b.x - a.x, b.y - a.y));
    }
    const mean = spacing.reduce((s, v) => s + v, 0) / spacing.length;
    // Every step should sit close to the mean; a resampling bug shows up here.
    for (const d of spacing) expect(Math.abs(d - mean) / mean).toBeLessThan(0.05);
  });

  it('closes on itself', () => {
    const start = sample(0);
    const end = sample(total);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
  });

  it('wraps for any course position, including negative ones', () => {
    const at = sample(total * 0.25);
    const wrapped = sample(total * 0.25 + total * 3);
    expect(wrapped.x).toBeCloseTo(at.x, 6);
    expect(wrapped.y).toBeCloseTo(at.y, 6);

    const negative = sample(-total * 0.75);
    expect(negative.x).toBeCloseTo(at.x, 6);
    expect(negative.y).toBeCloseTo(at.y, 6);
  });

  it('offsets laterally perpendicular to the heading', () => {
    const s = total * 0.31;
    const centre = sample(s);
    const offset = sample(s, 50);
    const dist = Math.hypot(offset.x - centre.x, offset.y - centre.y);
    expect(dist).toBeCloseTo(50, 6);

    // The offset must be perpendicular to the direction of travel.
    const along = [Math.cos(centre.angle), Math.sin(centre.angle)];
    const across = [offset.x - centre.x, offset.y - centre.y];
    expect(Math.abs(along[0] * across[0] + along[1] * across[1])).toBeLessThan(1e-6);
  });

  it('produces a continuous heading all the way round', () => {
    let previous = sample(0).angle;
    for (let s = 0; s <= total; s += total / 500) {
      const angle = sample(s).angle;
      const delta = Math.abs(Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)));
      expect(delta).toBeLessThan(0.2);
      previous = angle;
    }
  });

  it('starts the grid on a straight, so the first corner is visible in advance', () => {
    // Curvature at the line should be near zero compared with the course maximum.
    let maxCurve = 0;
    for (let s = 0; s < total; s += total / 500)
      maxCurve = Math.max(maxCurve, Math.abs(sample(s).curve));
    expect(Math.abs(sample(0).curve)).toBeLessThan(maxCurve * 0.2);
  });
});

describe('course layout', () => {
  it('derives pace constants from the course length', () => {
    expect(BASE).toBeCloseTo(total / 29.7, 10);
    expect(MAX / BASE).toBeCloseTo(2.4, 10);
    expect(RACE_DISTANCE).toBe(total * RACE_LAPS);
  });

  it('is never narrower than the base half-width', () => {
    for (let s = 0; s < total; s += total / 1000) expect(widthAt(s)).toBeGreaterThanOrEqual(HALF);
  });

  it('opens out at the wide sections and returns to base elsewhere', () => {
    expect(widthAt(total * 0.47)).toBeGreaterThan(HALF + 90);
    expect(widthAt(total * 0.17)).toBeGreaterThan(HALF + 60);
    // A point clear of every flare sits at the base width.
    expect(widthAt(total * 0.95)).toBeCloseTo(HALF, 6);
  });

  it('wraps width lookups like every other course position', () => {
    expect(widthAt(total * 0.47 + total * 2)).toBeCloseTo(widthAt(total * 0.47), 10);
    expect(widthAt(-total * 0.53)).toBeCloseTo(widthAt(total * 0.47), 10);
  });

  it('keeps both boost pads inside the road', () => {
    for (const pad of pads) {
      expect(Math.abs(pad.x) + 26).toBeLessThan(widthAt(pad.s));
      expect(pad.len).toBeGreaterThan(0);
    }
  });

  it('keeps the repair strip inside the road along its whole length', () => {
    for (let d = 0; d <= repair.len; d += 20) {
      const s = repair.s + d;
      expect(Math.abs(repairX(s)) + repair.width / 2).toBeLessThan(widthAt(s));
    }
  });

  it('places the repair strip and the pads apart, so power and speed are separate choices', () => {
    for (const pad of pads) {
      const gap = Math.abs(mod(pad.s - repair.s + total / 2, total) - total / 2);
      expect(gap).toBeGreaterThan(repair.len / 2);
    }
  });
});
