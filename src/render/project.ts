import { camera } from '../sim/state';
import { surface } from './surface';

export interface Projected {
  x: number;
  y: number;
  /** Screen pixels per world unit at this depth. */
  scale: number;
  /** Distance along the view direction. */
  depth: number;
}

/** Near clip, in world units. Closer points have no meaningful projection. */
const NEAR = 8;

/**
 * Projects a world point onto the scene canvas.
 *
 * Returns null when the point is behind the near plane, which callers use as a
 * cheap visibility reject.
 */
export function project(wx: number, wy: number, height = 0): Projected | null {
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const cs = Math.cos(camera.angle);
  const sn = Math.sin(camera.angle);
  const depth = dx * cs + dy * sn;
  if (depth < NEAR) return null;
  const scale = camera.focal / depth;
  return {
    x: surface.w / 2 + (-dx * sn + dy * cs) * scale,
    y: camera.horizon + (camera.height - height) * scale,
    scale,
    depth,
  };
}
