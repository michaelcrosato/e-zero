import { afterEach, describe, expect, it } from 'vitest';
import { cross, dot, length, sub } from '../../src/core/vector';
import { course, gradeAcceleration, lateralDrift, sampleCourse } from '../../src/track/course';
import { sampleSpatial, sectionAt, skyline } from '../../src/track/spatial';
import { sample, total } from '../../src/track/spline';

afterEach(() => {
  course.id = 'classic';
});

describe('3D course geometry', () => {
  it('wraps negative and multi-lap distances, including sideways offsets', () => {
    for (const s of [-total * 3 - 0.5, -1, 0, 0.01, total * 0.49, total * 5 + 17]) {
      const a = sampleSpatial(s, 53);
      const b = sampleSpatial(s + total * 4, 53);
      expect(length(sub(a, b))).toBeLessThan(1e-8);
      expect(dot(a.forward, b.forward)).toBeCloseTo(1, 10);
      expect(dot(a.up, b.up)).toBeCloseTo(1, 10);
    }
  });

  it('has continuous, right-handed orthonormal frames through vertical tangents and the lap seam', () => {
    for (let i = 0; i < skyline.frames.length; i++) {
      const a = sampleSpatial((i * total) / skyline.frames.length + 0.5);
      const b = sampleSpatial(((i + 1) * total) / skyline.frames.length + 0.5);
      for (const axis of [a.forward, a.right, a.up]) expect(length(axis)).toBeCloseTo(1, 10);
      expect(dot(a.forward, a.right)).toBeCloseTo(0, 10);
      expect(dot(a.right, a.up)).toBeCloseTo(0, 10);
      expect(dot(cross(a.forward, a.right), a.up)).toBeCloseTo(1, 10);
      expect(dot(a.forward, b.forward)).toBeGreaterThan(0.995);
      expect(dot(a.up, b.up)).toBeGreaterThan(0.995);
      expect(Number.isFinite(a.curve)).toBe(true);
    }
    expect(length(sub(sampleSpatial(-0.01), sampleSpatial(0.01)))).toBeCloseTo(0.02, 4);
  });

  it('measures distance along the 3D centre line instead of its map projection', () => {
    for (let s = 0; s < total; s += 31) {
      const a = sampleSpatial(s);
      const b = sampleSpatial(s + 1);
      expect(length(sub(a, b))).toBeCloseTo(1, 2);
    }
    expect(skyline.sections[skyline.sections.length - 1].end).toBeCloseTo(total, 8);
  });

  it('contains hills, banks, a full vertical inversion and a full corkscrew rotation', () => {
    const frames = skyline.frames;
    expect(
      Math.max(...frames.map((p) => p.z)) - Math.min(...frames.map((p) => p.z)),
    ).toBeGreaterThan(1000);
    expect(frames.some((p) => p.forward.z > 0.7)).toBe(true);
    expect(frames.some((p) => p.forward.z < -0.7)).toBe(true);
    for (const kind of ['loop', 'corkscrew']) {
      const section = skyline.sections.find((s) => s.kind === kind);
      expect(section).toBeDefined();
      if (!section) throw new Error('Missing section');
      const samples = Array.from({ length: 201 }, (_, i) =>
        sampleSpatial(section.start + ((section.end - section.start) * i) / 200),
      );
      expect(Math.min(...samples.map((p) => p.up.z))).toBeLessThan(-0.8);
      expect(samples[0].up.z).toBeGreaterThan(0.99);
      expect(samples[200].up.z).toBeGreaterThan(0.99);
      // Width follows the rotated right axis, including an inverted road.
      for (let i = 0; i < samples.length; i += 10) {
        const s = section.start + ((section.end - section.start) * i) / 200;
        const right = sub(sampleSpatial(s, 60), sampleSpatial(s, -60));
        expect(length(right)).toBeCloseTo(120, 6);
        expect(dot(right, samples[i].up)).toBeCloseTo(0, 6);
      }
    }
    const bank = frames.filter((_, i) => sectionAt((i * total) / frames.length).kind === 'bank');
    expect(Math.min(...bank.map((p) => p.right.z))).toBeLessThan(-0.5);
  });

  it('keeps non-neighbouring pieces of road apart in 3D', () => {
    const points = Array.from({ length: 600 }, (_, i) => sampleSpatial((i * total) / 600));
    let closest = Infinity;
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const gap = (Math.min(j - i, points.length - j + i) * total) / points.length;
        if (gap < 750) continue;
        closest = Math.min(closest, length(sub(points[i], points[j])));
      }
    expect(closest).toBeGreaterThan(300);
  });
});

describe('track-relative forces', () => {
  it('slows climbs, accelerates descents and resolves banking in road coordinates', () => {
    course.id = 'skyline';
    const climb = skyline.frames.find((p) => p.forward.z > 0.5);
    const descent = skyline.frames.find((p) => p.forward.z < -0.5);
    const bank = skyline.frames.find((p) => p.right.z < -0.4);
    if (!climb || !descent || !bank) throw new Error('Course lacks required forces');
    expect(gradeAcceleration(climb)).toBeLessThan(0);
    expect(gradeAcceleration(descent)).toBeGreaterThan(0);
    expect(lateralDrift(bank, 0)).toBeGreaterThan(0);
  });

  it('preserves the exact original sampler and drift on Classic', () => {
    for (let s = -total; s < total * 2; s += 79) {
      const p = sample(s, 23);
      const q = sampleCourse(s, 23);
      expect({ x: q.x, y: q.y, angle: q.angle, curve: q.curve }).toEqual(p);
      expect(lateralDrift(q, 700)).toBe(Math.max(-195, Math.min(195, -p.curve * 700 * 700 * 0.1)));
      expect(q.z).toBe(0);
    }
  });
});
