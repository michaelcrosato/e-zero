/**
 * Mode 7 style ground renderer.
 *
 * For each scanline below the horizon, the distance to the ground plane is
 * `height * focal / (y - horizon)`. Stepping across the row in world space and
 * sampling the baked terrain texture gives perspective for the cost of one
 * texture read per pixel. This is the hottest loop in the frame, so locals are
 * hoisted and the texture is addressed as a flat Uint32Array.
 */
import { SKY_H, TEX, TS } from '../config/constants';
import { camera } from '../sim/state';
import { terrain } from '../track/terrain';
import { groundFog } from './sky';
import { surface } from './surface';

/** Beyond this distance the ground is solid fog, so rows are filled flat. */
const FOG_DISTANCE = 3300;
/** The fog colour, pre-packed as little-endian 0xAABBGGRR to match ImageData. */
const FOG_PIXEL = 0xffa57eac;

export function drawGround(): void {
  const { ctx, w: W, h: H, pixels, frame, viewUnit } = surface;
  const tex32 = terrain.tex32;

  const fx = Math.cos(camera.angle);
  const fy = Math.sin(camera.angle);
  // Right-hand vector, perpendicular to the view direction.
  const rx = -fy;
  const ry = fx;
  const cy = camera.horizon | 0;
  const focal = camera.focal;
  const ch = camera.height;
  const mask = TEX - 1;
  const halfW = W / 2;

  for (let y = cy + 1; y < H; y++) {
    const dist = (ch * focal) / (y - cy);
    const row = y * W;
    if (dist > FOG_DISTANCE) {
      pixels.fill(FOG_PIXEL, row, row + W);
      continue;
    }
    const step = (dist / focal) * TS;
    let tx = (camera.x + fx * dist - (rx * halfW * dist) / focal) * TS;
    let ty = (camera.y + fy * dist - (ry * halfW * dist) / focal) * TS;
    const dx = rx * step;
    const dy = ry * step;
    for (let x = 0; x < W; x++) {
      pixels[row + x] = tex32[((ty | 0) & mask) * TEX + ((tx | 0) & mask)];
      tx += dx;
      ty += dy;
    }
  }

  ctx.putImageData(frame, 0, 0, 0, cy + 1, W, H - cy - 1);

  // Haze band just below the horizon, in sky reference space.
  ctx.save();
  ctx.translate(0, cy - SKY_H * viewUnit);
  ctx.scale(1, viewUnit);
  ctx.fillStyle = groundFog;
  ctx.fillRect(0, SKY_H + 1, W, 85);
  ctx.restore();
}
