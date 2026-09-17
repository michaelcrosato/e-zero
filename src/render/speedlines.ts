/**
 * Speed lines.
 *
 * Two layers: short streaks rising from the horizon that convey ground speed at
 * any pace, and a radial burst that only appears under boost. The radial layer
 * deliberately leaves the central steering area clear so it never hides traffic.
 */
import { reducedMotion } from '../core/env';
import { mod } from '../core/math';
import { boostFX, camera, game, player } from '../sim/state';
import { BASE } from '../track/layout';
import { surface } from './surface';

/** Below this speed ratio there are no speed lines at all. */
const MIN_RATIO = 0.45;
/** Above this camera blend the finish orbit has taken over. */
const CINEMATIC_CUTOFF = 0.2;

export function drawSpeed(): void {
  if (reducedMotion || game.cameraBlend > CINEMATIC_CUTOFF) return;

  const demo = game.mode === 'title';
  const ratio = demo ? 0.9 : player.v / BASE;
  if (ratio < MIN_RATIO) return;

  const { ctx, w: W, h: H } = surface;
  const boost = demo ? 0 : boostFX.amount;

  ctx.save();
  ctx.strokeStyle = boost > 0.1 ? '#b9f7ff' : '#dae6fb';
  ctx.lineWidth = 1;
  for (let i = 0; i < 36; i++) {
    const phase = mod(game.worldTime * (2.65 + boost * 2.4) + i * 0.173, 1);
    const side = i % 2 ? 1 : -1;
    const baseX = W / 2 + side * W * (0.202 + ((i * 47) % 245) / 768);
    const y = camera.horizon + 18 + phase * phase * (H - camera.horizon);
    const x = W / 2 + (baseX - W / 2) * (1 + phase * 0.62);
    ctx.globalAlpha = (demo ? 0.26 : 0.48 + boost * 0.4) * phase * 0.42;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * phase * (27 + boost * 28), y + phase * (43 + boost * 70));
    ctx.stroke();
  }

  if (boost > 0.015) {
    ctx.globalCompositeOperation = 'lighter';
    const cx = W / 2 - player.steer * 20;
    const cy = camera.horizon + 28;
    for (let i = 0; i < 52; i++) {
      const side = i % 2 ? 1 : -1;
      const phase = mod(game.worldTime * (1.8 + ratio * 0.64) + i * 0.137, 1);
      const dx = side * (260 + ((i * 53) % 360)) * (W / 768);
      const dy = (((i * 97) % 520) - 170) * (H / 432);
      const t = 0.46 + phase * phase * 0.91;
      const x = cx + dx * t;
      const y = cy + dy * t;
      const tail = 0.045 + phase * (0.13 + boost * 0.13);
      // No rays across the central steering area.
      if (x > W * 0.24 && x < W * 0.76 && y < H * 0.83) continue;
      ctx.strokeStyle = i % 7 === 0 ? '#ffa7e5' : i % 3 === 0 ? '#75dfff' : '#dbfeff';
      ctx.lineWidth = i % 5 === 0 ? 1.65 : 0.8;
      ctx.globalAlpha = boost * phase * (i % 5 === 0 ? 0.44 : 0.25);
      ctx.beginPath();
      ctx.moveTo(x - dx * tail, y - dy * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}
