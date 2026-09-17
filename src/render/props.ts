/**
 * Upright world objects: rail spheres, trackside signs, the start gate, and the
 * depth-sorted pass that draws them together with every craft.
 *
 * Everything in one frame shares a single painter's-algorithm sort, which is
 * what lets a rival pass behind a sign correctly.
 */
import { RAIL_RADIUS, TAU } from '../config/constants';
import { clamp } from '../core/math';
import { rivals } from '../sim/rivals';
import { scenery } from '../sim/scenery';
import { game, player } from '../sim/state';
import type { Scenery } from '../sim/types';
import { BASE, widthAt } from '../track/layout';
import { sample, type SamplePoint } from '../track/spline';
import { drawCraft } from './craft';
import { project, type Projected } from './project';
import { sphereSprites } from './sprites';
import { surface } from './surface';

/** Objects beyond this depth are not drawn. */
const FAR_DEPTH = 1850;
/** Fade-in distance for distant objects. */
const FADE_DEPTH = 700;

export function drawOrb(o: Scenery, pr: Projected): void {
  const { ctx, w: W, h: H } = surface;
  const radius = RAIL_RADIUS * pr.scale;
  if (radius < 0.65 || pr.x < -radius || pr.x > W + radius || pr.y - radius > H) return;
  ctx.save();
  const alpha = ctx.globalAlpha;
  // Contact shadow under the sphere.
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = '#041025';
  ctx.beginPath();
  ctx.ellipse(pr.x, pr.y + radius * 0.85, radius * 0.92, radius * 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    sphereSprites[o.pink ? 1 : 0],
    Math.round(pr.x - radius),
    Math.round(pr.y - radius),
    Math.max(2, Math.round(radius * 2)),
    Math.max(2, Math.round(radius * 2)),
  );
  ctx.restore();
}

export function drawSign(o: Scenery, p: SamplePoint): void {
  const { ctx, w: W } = surface;
  const b = project(p.x, p.y, 0);
  const t = project(p.x, p.y, o.height);
  if (!b || !t || b.depth > 1350) return;
  const sc = b.scale;
  const w = 64 * sc;
  const h = 24 * sc;
  if (t.x + w / 2 < 0 || t.x - w / 2 > W) return;
  // Post.
  ctx.fillStyle = '#1a2340';
  ctx.fillRect((b.x - 2 * sc) | 0, t.y, 4 * sc, b.y - t.y);
  // Board, then the top and bottom accent bars.
  ctx.fillStyle = '#101a32';
  ctx.fillRect(t.x - w / 2, t.y - h, w, h);
  ctx.fillStyle = o.text === 'POWER +' ? '#ff8bc9' : '#bbff75';
  ctx.fillRect(t.x - w / 2, t.y - h, w, Math.max(1, 2 * sc));
  ctx.fillRect(t.x - w / 2, t.y - 2 * sc, w, Math.max(1, 2 * sc));
  if (sc > 0.24) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 ' + Math.max(5, 10 * sc) + 'px Arial';
    ctx.fillText(o.text ?? '', t.x, t.y - h * 0.46);
    ctx.restore();
  }
}

export function drawGate(o: Scenery): void {
  const { ctx } = surface;
  const s = o.s ?? 0;
  const a = sample(s, -widthAt(s) - 11);
  const b = sample(s, widthAt(s) + 11);
  const ap = project(a.x, a.y);
  const bp = project(b.x, b.y);
  const at = project(a.x, a.y, o.height);
  const bt = project(b.x, b.y, o.height);
  if (!ap || !bp || !at || !bt || ap.depth > 1250 || ap.depth < 20) return;

  ctx.strokeStyle = '#19233f';
  ctx.lineWidth = Math.max(2, 7 * ap.scale);
  ctx.beginPath();
  ctx.moveTo(ap.x, ap.y);
  ctx.lineTo(at.x, at.y);
  ctx.lineTo(bt.x, bt.y);
  ctx.lineTo(bp.x, bp.y);
  ctx.stroke();

  ctx.strokeStyle = '#b6fff0';
  ctx.lineWidth = Math.max(1, 2 * ap.scale);
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(bt.x, bt.y);
  ctx.stroke();

  const scale = (ap.scale + bp.scale) / 2;
  const x = (at.x + bt.x) / 2;
  const y = (at.y + bt.y) / 2;
  ctx.fillStyle = '#10182d';
  ctx.fillRect(x - 35 * scale, y - 8 * scale, 70 * scale, 16 * scale);
  ctx.fillStyle = '#d5ff64';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 900 ' + Math.max(5, 9 * scale) + 'px Arial';
  ctx.fillText('E-ZERO', x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

type Drawable =
  | { kind: 'prop'; o: Scenery; p: SamplePoint; pr: Projected; depth: number }
  | {
      kind: 'car';
      car: { s: number; x: number; color: number; boosting?: boolean; v?: number };
      p: SamplePoint;
      pr: Projected;
      depth: number;
    }
  | { kind: 'player'; p: SamplePoint; pr: Projected; depth: number };

/** Draws all scenery and craft in one back-to-front pass. */
export function drawObjects(demo: boolean): void {
  const { ctx, w: W, h: H } = surface;
  const objects: Drawable[] = [];

  for (const o of scenery) {
    const pr = project(o.wx, o.wy, o.height || 0);
    if (!pr || pr.depth < 13 || pr.depth > FAR_DEPTH) continue;
    const margin = o.type === 'orb' ? Math.max(4, RAIL_RADIUS * pr.scale) : 200;
    if (pr.x < -margin || pr.x > W + margin || pr.y - margin > H) continue;
    objects.push({
      kind: 'prop',
      o,
      p: { x: o.wx, y: o.wy, angle: 0, curve: 0 },
      pr,
      depth: pr.depth,
    });
  }

  // On the title screen the field is posed around the attract camera instead of simulated.
  const cars = demo
    ? rivals.map((r) => ({
        s: game.demoS + r.startS,
        x: r.lane * (widthAt(game.demoS + r.startS) - 24),
        color: r.color,
      }))
    : rivals;

  for (const r of cars) {
    const p = sample(r.s, r.x);
    const pr = project(p.x, p.y, 3);
    if (pr && pr.depth < 1750 && pr.depth > 18 && pr.x > -150 && pr.x < W + 150)
      objects.push({ kind: 'car', car: r, p, pr, depth: pr.depth });
  }

  const s = demo ? game.demoS : player.s;
  const x = demo ? Math.sin(game.worldTime * 0.6) * 16 : player.x;
  const p = sample(s, x);
  const pr = project(p.x, p.y, 3);
  if (pr) objects.push({ kind: 'player', p, pr, depth: pr.depth });

  objects.sort((a, b) => b.depth - a.depth);

  for (const ob of objects) {
    ctx.globalAlpha = ob.kind === 'player' ? 1 : clamp((FAR_DEPTH - ob.depth) / FADE_DEPTH, 0, 1);
    if (ob.kind === 'player') {
      drawCraft(
        ob.p,
        0,
        demo ? Math.sin(game.worldTime) * 0.18 : player.steer * 0.75 + player.kickV * 0.0015,
        true,
      );
    } else if (ob.kind === 'car') {
      drawCraft(
        ob.p,
        ob.car.color,
        Math.sin(game.worldTime + ob.car.color) * 0.15,
        false,
        !!ob.car.boosting && (ob.car.v ?? 0) > BASE * 1.16,
      );
    } else if (ob.o.type === 'orb') {
      drawOrb(ob.o, ob.pr);
    } else if (ob.o.type === 'sign') {
      drawSign(ob.o, ob.p);
    } else if (ob.o.type === 'gate') {
      drawGate(ob.o);
    }
  }
  ctx.globalAlpha = 1;
}
