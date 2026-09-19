/** Right-handed world coordinates: x/y on the map, z upwards. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => vec(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function normalize(a: Vec3): Vec3 {
  const n = length(a);
  if (n < 1e-10) throw new Error('Degenerate track frame');
  return scale(a, 1 / n);
}
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

export interface Frame3 extends Vec3 {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  /** Curvature towards the road's right edge, independent of world orientation. */
  curve: number;
  angle: number;
  bank: number;
}

export function offset(frame: Frame3, lateral: number, height = 0, forward = 0): Vec3 {
  return vec(
    frame.x + frame.right.x * lateral + frame.up.x * height + frame.forward.x * forward,
    frame.y + frame.right.y * lateral + frame.up.y * height + frame.forward.y * forward,
    frame.z + frame.right.z * lateral + frame.up.z * height + frame.forward.z * forward,
  );
}
