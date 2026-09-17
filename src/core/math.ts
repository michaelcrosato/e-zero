/** Small numeric helpers shared by the simulation and the renderer. */

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Euclidean modulo: the result always carries the sign of `n`. */
export const mod = (v: number, n: number): number => ((v % n) + n) % n;

/** Shortest signed angular distance from `b` to `a`, in radians. */
export const angleDiff = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Smoothstep on [0,1]. */
export const smooth = (t: number): number => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
