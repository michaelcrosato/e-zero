import { describe, expect, it } from 'vitest';
import { angleDiff, clamp, lerp, mod, smooth } from '../../src/core/math';
import { createRng } from '../../src/core/rng';
import { formatTime } from '../../src/core/time';

describe('clamp', () => {
  it('bounds a value to the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates and extrapolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe('mod', () => {
  it('always returns a non-negative result for a positive modulus', () => {
    expect(mod(7, 5)).toBe(2);
    expect(mod(-1, 5)).toBe(4);
    expect(mod(-7, 5)).toBe(3);
    expect(mod(0, 5)).toBe(0);
  });

  it('is what makes lap wrapping work for negative course positions', () => {
    const total = 1000;
    expect(mod(-1, total)).toBe(999);
    expect(mod(total, total)).toBe(0);
  });
});

describe('angleDiff', () => {
  it('returns the shortest signed angle across the wrap point', () => {
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(0.2, 10);
    // Just past pi should come back as a small negative angle, not ~2pi.
    expect(angleDiff(-Math.PI + 0.05, Math.PI - 0.05)).toBeCloseTo(0.1, 10);
    expect(Math.abs(angleDiff(0, Math.PI * 2))).toBeLessThan(1e-9);
  });
});

describe('smooth', () => {
  it('is clamped smoothstep', () => {
    expect(smooth(-1)).toBe(0);
    expect(smooth(0)).toBe(0);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(1)).toBe(1);
    expect(smooth(2)).toBe(1);
  });

  it('eases in and out rather than tracking linearly', () => {
    expect(smooth(0.25)).toBeLessThan(0.25);
    expect(smooth(0.75)).toBeGreaterThan(0.75);
  });
});

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(7152026);
    const b = createRng(7152026);
    const first = Array.from({ length: 50 }, () => a());
    const second = Array.from({ length: 50 }, () => b());
    expect(first).toEqual(second);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 5000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has a roughly uniform distribution', () => {
    const rng = createRng(99);
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++;
    for (const count of buckets) expect(Math.abs(count - n / 10) / (n / 10)).toBeLessThan(0.05);
  });
});

describe('formatTime', () => {
  it('formats as MM:SS.cc', () => {
    expect(formatTime(0)).toBe('00:00.00');
    expect(formatTime(1.23)).toBe('00:01.23');
    expect(formatTime(59.99)).toBe('00:59.99');
    expect(formatTime(60)).toBe('01:00.00');
    expect(formatTime(90.5)).toBe('01:30.50');
    expect(formatTime(3599.99)).toBe('59:59.99');
  });

  it('truncates rather than rounds, so a clock never shows a time not yet reached', () => {
    expect(formatTime(1.239)).toBe('00:01.23');
  });
});
