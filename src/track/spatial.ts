import { angleDiff, lerp, mod } from '../core/math';
import {
  add,
  cross,
  dot,
  length,
  mix,
  normalize,
  offset,
  scale,
  sub,
  vec,
  type Frame3,
  type Vec3,
} from '../core/vector';
import { total } from './spline';

export type SectionKind = 'straight' | 'hill' | 'bank' | 'loop' | 'corkscrew';
export interface Section {
  name: string;
  kind: SectionKind;
  start: number;
  end: number;
}
export interface Segment {
  name: string;
  kind: SectionKind;
  length: number;
  radius?: number;
  height?: number;
  bank?: number;
}

/** A closed circuit made from reusable local-space primitives. Lengths are authoring units. */
export const SKYLINE_DESIGN: readonly Segment[] = [
  { name: 'Launch straight', kind: 'straight', length: 900 },
  { name: 'Summit climb', kind: 'hill', length: 2000, height: 650 },
  { name: 'Sky bridge', kind: 'straight', length: 900 },
  { name: 'High bank', kind: 'bank', length: Math.PI * 450, radius: 900, bank: -0.62 },
  { name: 'Vertical loop', kind: 'loop', length: 2200, radius: 550 },
  { name: 'Carousel', kind: 'bank', length: Math.PI * 450, radius: 900, bank: -0.48 },
  { name: 'Corkscrew', kind: 'corkscrew', length: 3800, radius: 290 },
  { name: 'Sweeper', kind: 'bank', length: Math.PI * 450, radius: 900, bank: -0.55 },
  { name: 'Valley descent', kind: 'hill', length: 2200, height: -380 },
  { name: 'Home bend', kind: 'bank', length: Math.PI * 450, radius: 900, bank: -0.42 },
];

const ease = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const bump = (t: number): number => 64 * t ** 3 * (1 - t) ** 3;

interface Raw extends Vec3 {
  heading: number;
  bank: number;
  s: number;
}

/** Resample in genuine 3D arc length, then choose the circuit's world-unit scale. */
export function buildSpatial(
  design: readonly Segment[],
  lapLength: number,
): { frames: Frame3[]; sections: Section[] } {
  const raw: Raw[] = [{ x: 0, y: 0, z: 700, heading: 0, bank: 0, s: 0 }];
  const sections: Section[] = [];
  let origin = vec(0, 0, 700);
  let heading = 0;
  let distance = 0;
  for (const part of design) {
    const start = distance;
    const forward = vec(Math.cos(heading), Math.sin(heading));
    const right = vec(-forward.y, forward.x);
    const count = Math.ceil(part.length / 5);
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const turn = Math.PI * 2 * ease(t);
      let along = part.length * t;
      let side = 0;
      let height = 0;
      let yaw = heading;
      let bank = 0;
      if (part.kind === 'hill') height = (part.height ?? 0) * bump(t);
      if (part.kind === 'bank') {
        const radius = part.radius ?? 900;
        const theta = (part.length * t) / radius;
        along = Math.sin(theta) * radius;
        side = (1 - Math.cos(theta)) * radius;
        yaw += theta;
        bank = (part.bank ?? 0) * bump(t);
      }
      if (part.kind === 'loop') {
        const radius = part.radius ?? 550;
        along += radius * Math.sin(turn);
        // Offset the two legs sideways so the crossing has real road-width clearance.
        side = radius * Math.sin(turn);
        height = radius * (1 - Math.cos(turn));
      }
      if (part.kind === 'corkscrew') {
        const radius = part.radius ?? 290;
        side = radius * Math.sin(turn);
        height = radius * (1 - Math.cos(turn));
        bank = turn;
      }
      const p = add(origin, add(scale(forward, along), add(scale(right, side), vec(0, 0, height))));
      distance += length(sub(p, raw[raw.length - 1]));
      raw.push({ ...p, heading: yaw, bank, s: distance });
    }
    const last = raw[raw.length - 1];
    origin = vec(last.x, last.y, last.z);
    heading = last.heading;
    sections.push({ name: part.name, kind: part.kind, start, end: distance });
  }
  if (length(sub(raw[0], raw[raw.length - 1])) > 0.01) throw new Error('Spatial course must close');
  const worldScale = lapLength / distance;
  const count = Math.ceil(lapLength / 8);
  const points: Raw[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const d = (distance * i) / count;
    while (cursor < raw.length - 2 && raw[cursor + 1].s < d) cursor++;
    const a = raw[cursor];
    const b = raw[cursor + 1];
    const t = (d - a.s) / (b.s - a.s);
    points.push({
      ...scale(mix(a, b, t), worldScale),
      heading: a.heading + angleDiff(b.heading, a.heading) * t,
      bank: a.bank + angleDiff(b.bank, a.bank) * t,
      s: d * worldScale,
    });
  }
  const frames = points.map((p, i): Frame3 => {
    const forward = normalize(sub(points[(i + 1) % count], points[mod(i - 1, count)]));
    // The authored heading survives vertical tangents: atan2(x/y) alone cannot do this.
    const reference = vec(-Math.sin(p.heading), Math.cos(p.heading));
    const right0 = normalize(sub(reference, scale(forward, dot(reference, forward))));
    const up0 = cross(forward, right0);
    const right = add(scale(right0, Math.cos(p.bank)), scale(up0, Math.sin(p.bank)));
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      forward,
      right,
      up: cross(forward, right),
      angle: Math.atan2(forward.y, forward.x),
      bank: p.bank,
      curve: 0,
    };
  });
  for (let i = 0; i < count; i++) {
    const derivative = scale(
      sub(frames[(i + 2) % count].forward, frames[mod(i - 2, count)].forward),
      count / (4 * lapLength),
    );
    frames[i].curve = dot(derivative, frames[i].right);
  }
  return {
    frames,
    sections: sections.map((s) => ({ ...s, start: s.start * worldScale, end: s.end * worldScale })),
  };
}

// Same lap length as Neon Harbor, so the speed scale and three-lap race duration stay familiar.
export const skyline = buildSpatial(SKYLINE_DESIGN, total);

export function sampleSpatial(s: number, lateral = 0): Frame3 {
  const f = (mod(s, total) / total) * skyline.frames.length;
  const i = Math.floor(f);
  const t = f - i;
  const a = skyline.frames[i];
  const b = skyline.frames[(i + 1) % skyline.frames.length];
  const forward = normalize(mix(a.forward, b.forward, t));
  const r = mix(a.right, b.right, t);
  const right = normalize(sub(r, scale(forward, dot(r, forward))));
  const frame: Frame3 = {
    ...mix(a, b, t),
    forward,
    right,
    up: cross(forward, right),
    angle: Math.atan2(forward.y, forward.x),
    bank: a.bank + angleDiff(b.bank, a.bank) * t,
    curve: lerp(a.curve, b.curve, t),
  };
  return lateral ? { ...frame, ...offset(frame, lateral) } : frame;
}

export function sectionAt(s: number): Section {
  const d = mod(s, total);
  return skyline.sections.find((part) => d >= part.start && d < part.end) ?? skyline.sections[0];
}
