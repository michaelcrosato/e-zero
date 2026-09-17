/**
 * Sky, star field, sun and parallax skyline.
 *
 * Everything above the horizon is drawn in a fixed reference space that is
 * `SKY_H` units tall and then scaled to the current horizon, so the sky keeps
 * its proportions on any window shape. Horizontal motion is driven purely by
 * camera yaw, which is what sells the turn.
 */
import { SKY_H, TAU } from '../config/constants';
import { mod } from '../core/math';
import { camera } from '../sim/state';
import { surface } from './surface';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

interface Building {
  x: number;
  w: number;
  h: number;
  antenna: boolean;
  seed: number;
}

const stars: Star[] = [];
const skylineLayers: Building[][] = [[], []];

/** Width of one repeat of the skyline strip, in reference units. */
const SKYLINE_SPAN = 1800;

const skyGradient = surface.ctx.createLinearGradient(0, 0, 0, SKY_H);
skyGradient.addColorStop(0, '#111830');
skyGradient.addColorStop(0.47, '#3e285d');
skyGradient.addColorStop(0.78, '#ac4f8c');
skyGradient.addColorStop(1, '#eda5bb');

const groundFog = surface.ctx.createLinearGradient(0, SKY_H, 0, SKY_H + 85);
groundFog.addColorStop(0, '#ac7ea5');
groundFog.addColorStop(0.18, '#967696bb');
groundFog.addColorStop(0.55, '#75668d30');
groundFog.addColorStop(1, '#6e5c8000');

export { groundFog };

/**
 * Generates the star field and both skyline layers.
 *
 * Must be called after the terrain bake, because both draw from the same
 * deterministic stream and the draw order is part of the world's identity.
 */
export function initSky(random: () => number): void {
  stars.length = 0;
  for (let i = 0; i < 95; i++) {
    stars.push({
      x: random() * 768,
      y: random() * 98,
      size: random() > 0.9 ? 2 : 1,
      alpha: 0.25 + random() * 0.6,
    });
  }
  skylineLayers[0].length = 0;
  skylineLayers[1].length = 0;
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < SKYLINE_SPAN) {
      const width = 9 + Math.floor(random() * 26);
      const height = 8 + Math.floor(random() * (layer ? 59 : 39));
      skylineLayers[layer].push({
        x,
        w: width,
        h: height,
        antenna: random() > 0.77,
        seed: Math.floor(random() * 99),
      });
      x += width + 2 + Math.floor(random() * 10);
    }
  }
}

export function drawSky(): void {
  const { ctx, w: W, viewUnit: unit } = surface;
  const horizon = camera.horizon;
  const span = W / unit;

  ctx.save();

  // Base gradient, stretched to meet the current horizon.
  ctx.save();
  ctx.scale(1, horizon / SKY_H);
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, W, SKY_H + 1);
  ctx.restore();

  for (const star of stars) {
    const x = mod((star.x / 768) * W - camera.angle * 31 * unit, W);
    const y = (star.y / 98) * Math.max(1, horizon - 22 * unit);
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = '#ece1fb';
    const size = Math.max(1, star.size * unit);
    ctx.fillRect(x | 0, y | 0, size, size);
  }

  ctx.globalAlpha = 1;
  ctx.translate(0, horizon - SKY_H * unit);
  ctx.scale(unit, unit);

  // Sun: a clipped vertical gradient with scanline bands across its lower half.
  const sunX = mod(span * 0.75 - camera.angle * 40, span + 100) - 50;
  const sunY = 55;
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, sunY, 35, 0, TAU);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 20, 0, 90);
  g.addColorStop(0, '#e9ccd9');
  g.addColorStop(1, '#e694b0');
  ctx.fillStyle = g;
  ctx.fillRect(sunX - 36, 20, 72, 72);
  ctx.fillStyle = '#7d477c';
  for (let y = 59; y < 95; y += 6) ctx.fillRect(sunX - 36, y, 72, 2 + (((y - 59) / 12) | 0));
  ctx.restore();

  for (let layer = 0; layer < 2; layer++) {
    const parallax = mod(camera.angle * (layer ? 114 : 72), SKYLINE_SPAN);
    ctx.fillStyle = layer ? '#252843' : '#675174';
    for (const b of skylineLayers[layer]) {
      for (
        let x = mod(b.x - parallax + SKYLINE_SPAN, SKYLINE_SPAN) - 65;
        x < span + 35;
        x += SKYLINE_SPAN
      ) {
        const y = SKY_H - b.h + (layer ? 0 : -3);
        ctx.fillRect(x | 0, y | 0, b.w, b.h + 5);
        if (b.antenna) {
          ctx.fillRect((x + b.w * 0.55) | 0, y - 9, 2, 9);
          if (layer) {
            ctx.fillStyle = '#fa93be';
            ctx.fillRect((x + b.w * 0.55) | 0, y - 10, 2, 2);
            ctx.fillStyle = '#252843';
          }
        }
        // Lit windows only on the near layer, where they are large enough to read.
        if (layer) {
          for (let yy = y + 6; yy < SKY_H - 3; yy += 7) {
            for (let xx = x + 4; xx < x + b.w - 2; xx += 6) {
              if (((xx + yy + b.seed) | 0) % 5 < 2) {
                ctx.fillStyle = (b.seed + yy) % 3 ? '#7ca5b4' : '#ed9fc7';
                ctx.fillRect(xx | 0, yy | 0, 2, 2);
              }
            }
          }
          ctx.fillStyle = '#252843';
          if (b.h > 42) {
            ctx.fillStyle = '#75bdd0';
            ctx.fillRect(x | 0, y, b.w, 1);
            ctx.fillStyle = '#252843';
          }
        }
      }
    }
  }

  ctx.fillStyle = '#dc92b5';
  ctx.fillRect(0, SKY_H - 1, span, 1);
  ctx.fillStyle = '#a776a4';
  ctx.fillRect(0, SKY_H, span, 3);
  ctx.restore();
}
