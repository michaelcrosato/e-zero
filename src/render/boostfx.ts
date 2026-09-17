/**
 * Boost screen effects: edge wash, ignition rings, particle streaks and the
 * sloped edge marks that give boost its own visual signature.
 *
 * All of this is suppressed under reduced motion except a dimmed edge wash, and
 * during the finish orbit, where screen-space effects would not track the craft.
 */
import { TAU } from '../config/constants';
import { reducedMotion } from '../core/env';
import { clamp } from '../core/math';
import { boostFX, game, player } from '../sim/state';
import { sample } from '../track/spline';
import { project } from './project';
import { boostEdge } from './sprites';
import { surface } from './surface';

/** Above this camera blend the orbit has taken over and screen FX are hidden. */
const CINEMATIC_CUTOFF = 0.2;

export function drawBoostFX(demo: boolean): void {
  const amount = demo ? 0 : boostFX.amount;
  if (amount < 0.005 || game.cameraBlend > CINEMATIC_CUTOFF) return;

  const { ctx, w: W, h: H } = surface;
  ctx.save();
  ctx.globalAlpha = amount * (reducedMotion ? 0.42 : 1);
  ctx.drawImage(boostEdge, 0, 0);

  if (!reducedMotion) {
    // Two expanding rings mark ignition. There is no full-screen flash.
    if (boostFX.burst > 0) {
      const age = 1 - boostFX.burst;
      const p = sample(player.s, player.x);
      const pr = project(p.x, p.y, 4);
      if (pr) {
        for (let i = 0; i < 2; i++) {
          const t = clamp(age - i * 0.09, 0, 1);
          const r = (25 + (1 - Math.pow(1 - t, 2)) * 630) * Math.max(W / 768, H / 432);
          ctx.globalAlpha = Math.sin(t * Math.PI) * Math.pow(1 - t, 1.7) * 0.72 * amount;
          ctx.strokeStyle = i ? '#ffa0e1' : '#b1fbff';
          ctx.lineWidth = i ? 1.3 : 2.1;
          ctx.beginPath();
          ctx.ellipse(pr.x, pr.y - 6, r, r * 0.44, 0, 0, TAU);
          ctx.stroke();
        }
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const p of boostFX.particles) {
      ctx.globalAlpha = clamp(p.life / 0.18, 0, 1) * amount * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.019, p.y - p.vy * 0.019);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.globalAlpha = amount * 0.58;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = side < 0 ? 8 : W - 8;
        const y = H * 0.57 + i * 18;
        ctx.strokeStyle = i % 2 ? '#d892eb' : '#8cefff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - side * 10, y + 9);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
