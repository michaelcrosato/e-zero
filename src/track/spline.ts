import { COURSE_SCALE } from '../config/constants';
import { angleDiff, lerp, mod } from '../core/math';

export interface TrackPoint {
  x: number;
  y: number;
  /** Heading of the centre line at this point, in radians. */
  angle: number;
  /** Signed curvature. Positive turns one way, negative the other. */
  curve: number;
}

/** A point on the course, offset sideways from the centre line. */
export interface SamplePoint {
  x: number;
  y: number;
  angle: number;
  curve: number;
}

/** Course control points, in pre-scale units. */
const CONTROL_POINTS: ReadonlyArray<readonly [number, number]> = [
  [1880, 3490],
  [1870, 2910],
  [1640, 2440],
  [1050, 2060],
  [750, 1530],
  [850, 990],
  [1330, 650],
  [1980, 620],
  [2620, 940],
  [3040, 1510],
  [3120, 2090],
  [2780, 2600],
  [2940, 3130],
  [2570, 3530],
];

const controlPoints: Array<[number, number]> = CONTROL_POINTS.map(([x, y]) => [
  x * COURSE_SCALE,
  y * COURSE_SCALE,
]);

/** Closed Catmull-Rom interpolation. `t` is in control-point index space. */
function catmull(t: number): { x: number; y: number } {
  const n = controlPoints.length;
  const i = Math.floor(t);
  const f = t - i;
  const p0 = controlPoints[mod(i - 1, n)];
  const p1 = controlPoints[mod(i, n)];
  const p2 = controlPoints[mod(i + 1, n)];
  const p3 = controlPoints[mod(i + 2, n)];
  const f2 = f * f;
  const f3 = f2 * f;
  return {
    x:
      0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * f +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * f2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * f3),
    y:
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * f +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * f2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * f3),
  };
}

/** Spacing of the resampled centre line, in world units. */
const STEP = 8;
/** Subdivisions per control-point segment when measuring arc length. */
const SUBDIVISIONS = 320;
/** Distance the grid sits back from the first corner, in pre-scale units. */
const GRID_OFFSET = 410;

function buildTrack(): { track: TrackPoint[]; total: number; count: number } {
  // A closed spline resampled by distance keeps steering and lap timing
  // consistent: equal steps of `s` are equal distances travelled.
  const raw: Array<{ x: number; y: number; s: number }> = [];
  let total = 0;
  let prev = catmull(0);
  raw.push({ ...prev, s: 0 });
  for (let i = 1; i <= controlPoints.length * SUBDIVISIONS; i++) {
    const p = catmull(i / SUBDIVISIONS);
    total += Math.hypot(p.x - prev.x, p.y - prev.y);
    raw.push({ ...p, s: total });
    prev = p;
  }

  const count = Math.ceil(total / STEP);
  const track: TrackPoint[] = [];
  let ri = 0;
  for (let i = 0; i < count; i++) {
    const d = (i * total) / count;
    while (ri < raw.length - 2 && raw[ri + 1].s < d) ri++;
    const a = raw[ri];
    const b = raw[ri + 1];
    const f = (d - a.s) / (b.s - a.s);
    track.push({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), angle: 0, curve: 0 });
  }

  // Put the starting grid on a straight so the first turn is visible before it arrives.
  track.push(...track.splice(0, Math.floor(((GRID_OFFSET * COURSE_SCALE) / total) * count)));

  for (let i = 0; i < count; i++) {
    const a = track[mod(i - 2, count)];
    const b = track[mod(i + 2, count)];
    track[i].angle = Math.atan2(b.y - a.y, b.x - a.x);
  }
  for (let i = 0; i < count; i++) {
    track[i].curve =
      angleDiff(track[mod(i + 5, count)].angle, track[mod(i - 5, count)].angle) /
      ((10 * total) / count);
  }
  return { track, total, count };
}

const built = buildTrack();

/** The resampled centre line. Index spacing is uniform in distance. */
export const track: ReadonlyArray<TrackPoint> = built.track;
/** Total course length for one lap, in world units. */
export const total = built.total;
/** Number of samples in `track`. */
export const N = built.count;

/**
 * Position on the course at distance `s`, offset `lateral` units sideways.
 * `s` wraps, so this is valid on any lap. Hot path: called several thousand
 * times per frame.
 */
export function sample(s: number, lateral = 0): SamplePoint {
  const f = (mod(s, total) / total) * N;
  const i = Math.floor(f);
  const a = track[i];
  const b = track[(i + 1) % N];
  const t = f - i;
  const angle = a.angle + angleDiff(b.angle, a.angle) * t;
  return {
    x: lerp(a.x, b.x, t) - Math.sin(angle) * lateral,
    y: lerp(a.y, b.y, t) + Math.cos(angle) * lateral,
    angle,
    curve: lerp(a.curve, b.curve, t),
  };
}
