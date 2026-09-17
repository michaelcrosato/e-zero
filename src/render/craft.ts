/**
 * Craft rendering.
 *
 * Two representations, cross-faded by `drawCraft`:
 *
 * - `shipDraw` blits the pre-rendered rear-view sprite. This is what you see for
 *   the whole race, and for every distant rival.
 * - The face-sorted 3D build below only appears when the finish camera swings
 *   away from directly behind the craft, so it can show the front and sides.
 *   Painter's algorithm over ~40 flat faces is plenty at this scale.
 */
import { TAU } from '../config/constants';
import { reducedMotion } from '../core/env';
import { angleDiff, smooth } from '../core/math';
import { boostFX, camera, game, player } from '../sim/state';
import type { SamplePoint } from '../track/spline';
import { project, type Projected } from './project';
import { boostGhosts, polygon, shipPalettes, shipSprites, type Point2 } from './sprites';
import { surface } from './surface';

type Vertex3 = readonly [number, number, number];
type Outline = ReadonlyArray<Point2>;

interface Face {
  pts: Projected[];
  fill: string;
  alpha: number;
  depth: number;
}

/** Below this projected scale a craft is drawn as a sprite only. */
const SPRITE_ONLY_SCALE = 0.13;
/** Below this it is not worth drawing at all. */
const CULL_SCALE = 0.035;

/** Draws the pre-rendered craft sprite, with thruster flames and boost bloom. */
export function shipDraw(
  x: number,
  y: number,
  scale: number,
  color: number,
  lean = 0,
  isPlayer = false,
  rivalBoost = false,
): void {
  if (scale < 0.045) return;
  const { ctx } = surface;
  const width = 28 * scale;
  const height = width * 0.72;
  const bob = Math.sin(game.worldTime * 24 + color) * Math.min(2, scale * 0.6);

  // Contact shadow.
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#020e29';
  ctx.beginPath();
  ctx.ellipse(x, y + 3, width * 0.46, width * 0.085, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y - height * 0.35 + bob);
  ctx.rotate(lean * (isPlayer ? 0.09 : 0.035));

  const boosted = isPlayer && boostFX.amount > 0.05;
  const thrust = boosted ? boostFX.amount : 0;
  const flame =
    12 +
    thrust * 66 +
    (rivalBoost ? 24 : 0) +
    Math.sin(game.worldTime * 83 + color) * (boosted ? 6 : 3);
  const k = width / 100;

  if (boosted) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(0, 18 * k, 4 * k, 0, 18 * k, 72 * k);
    glow.addColorStop(0, '#55dbff65');
    glow.addColorStop(0.46, '#44bcff24');
    glow.addColorStop(1, '#33bcff00');
    ctx.globalAlpha *= thrust;
    ctx.fillStyle = glow;
    ctx.fillRect(-75 * k, -55 * k, 150 * k, 150 * k);
    if (!reducedMotion) {
      for (let i = 3; i > 0; i--) {
        ctx.save();
        ctx.globalAlpha *= 0.16 - i * 0.032;
        const size = 1 + i * 0.05;
        ctx.scale(k * size, k * size);
        ctx.drawImage(boostGhosts[i % 2], -50 - player.steer * i * 2.4, -40 + i * 14);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  ctx.save();
  ctx.scale(k, k);
  ctx.translate(-50, -40);
  for (const ex of [21, 79]) {
    polygon(
      ctx,
      [
        [ex - 7, 48],
        [ex + 7, 48],
        [ex + 5, 56 + flame * 0.55],
        [ex, 58 + flame],
        [ex - 5, 56 + flame * 0.55],
      ],
      boosted || rivalBoost ? '#71dcff' : '#fca37d',
    );
    polygon(
      ctx,
      [
        [ex - 4, 49],
        [ex + 4, 49],
        [ex + 2, 57 + flame * 0.6],
        [ex, 60 + flame * 0.7],
        [ex - 2, 57 + flame * 0.6],
      ],
      '#eefeff',
    );
  }
  if (boosted) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= thrust * 0.55;
    for (const ex of [21, 79]) {
      polygon(
        ctx,
        [
          [ex - 10, 52],
          [ex + 10, 52],
          [ex + 6, 86],
          [ex, 88 + flame],
          [ex - 6, 86],
        ],
        '#539dff',
      );
      // Diamond shock beads down the exhaust plume.
      for (let i = 0; i < 3; i++) {
        const yy = 64 + i * 17;
        const w = 6 - i;
        polygon(
          ctx,
          [
            [ex - w, yy],
            [ex, yy - 5],
            [ex + w, yy],
            [ex, yy + 5],
          ],
          '#d5fcff',
        );
      }
    }
    ctx.restore();
  }
  ctx.drawImage(shipSprites[color], 0, 0);
  ctx.restore();
  ctx.restore();
}

export function drawCraft(
  p: SamplePoint,
  color: number,
  lean = 0,
  isPlayer = false,
  rivalBoost = false,
): void {
  const center = project(p.x, p.y, 4);
  if (!center || center.scale < CULL_SCALE) return;
  const { ctx } = surface;

  if (center.scale < SPRITE_ONLY_SCALE) {
    shipDraw(center.x, center.y, center.scale, color, lean, isPlayer, rivalBoost);
    return;
  }

  // Fade to the 3D build only once the camera is off-axis and cinematic.
  const meshAmount =
    smooth((Math.abs(angleDiff(camera.angle, p.angle)) - 0.045) / 0.28) *
    smooth(game.cameraBlend / 0.4);

  if (meshAmount < 1) {
    ctx.save();
    ctx.globalAlpha *= 1 - meshAmount;
    shipDraw(center.x, center.y, center.scale, color, lean, isPlayer, rivalBoost);
    ctx.restore();
  }
  if (meshAmount <= 0.001) return;

  ctx.save();
  ctx.globalAlpha *= meshAmount;

  const palette = shipPalettes[color];
  const faces: Face[] = [];
  const yaw = p.angle + lean * 0.025;
  const fx = Math.cos(yaw);
  const fy = Math.sin(yaw);
  const rx = -fy;
  const ry = fx;
  const hover = 3.4 + Math.sin(game.worldTime * 24 + color) * 0.55;
  const roll = lean * 0.07;

  /** Local craft space -> world -> screen. u is across, f is forward, third is height. */
  const point = (v: Vertex3): Projected | null => {
    const u = v[0] * 0.72;
    const f = v[1] * 0.7;
    const h = hover + v[2] * 0.85 + u * roll;
    return project(p.x + rx * u + fx * f, p.y + ry * u + fy * f, h);
  };

  const face = (vertices: ReadonlyArray<Vertex3>, fill: string, alpha = 1): void => {
    const pts = vertices.map(point);
    if (pts.some((v) => !v)) return;
    const solid = pts as Projected[];
    faces.push({
      pts: solid,
      fill,
      alpha,
      depth: solid.reduce((n, v) => n + v.depth, 0) / solid.length,
    });
  };

  /** Extrudes a 2D outline between two heights: a top cap plus side walls. */
  const prism = (outline: Outline, bottom: number, top: number, fill: string): void => {
    face(
      outline.map((v) => [v[0], v[1], top] as Vertex3),
      fill,
    );
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      face(
        [
          [a[0], a[1], bottom],
          [b[0], b[1], bottom],
          [b[0], b[1], top],
          [a[0], a[1], top],
        ],
        i % 3 === 0 ? palette.dark : palette.mid,
      );
    }
  };

  // Ground shadow, projected as a flat ellipse of points.
  const shadow: Point2[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const u = Math.cos(a) * 18;
    const f = Math.sin(a) * 23;
    const pr = project(p.x + rx * u + fx * f, p.y + ry * u + fy * f, 0.3);
    if (pr) shadow.push([pr.x, pr.y]);
  }
  ctx.save();
  ctx.globalAlpha *= 0.28;
  polygon(ctx, shadow, '#020a20');
  ctx.restore();

  // A single engine frame joins the hull and the two side pods.
  prism(
    [
      [-20, -19],
      [20, -19],
      [20, -10],
      [-20, -10],
    ],
    1,
    4,
    palette.dark,
  );
  prism(
    [
      [-9, -23],
      [9, -23],
      [12, -9],
      [7, 17],
      [0, 31],
      [-7, 17],
      [-12, -9],
    ],
    2,
    7,
    palette.body,
  );
  face(
    [
      [-9, -22, 7.1],
      [9, -22, 7.1],
      [7, -10, 7.1],
      [-7, -10, 7.1],
    ],
    palette.mid,
  );
  face(
    [
      [-2, 28, 7.1],
      [2, 28, 7.1],
      [3, 11, 7.1],
      [-3, 11, 7.1],
    ],
    palette.light,
  );

  for (const side of [-1, 1]) {
    const cx = side * 16;
    prism(
      [
        [cx - 5, -24],
        [cx + 5, -24],
        [cx + 6, -9],
        [cx + 4, 17],
        [cx - 3, 20],
        [cx - 6, -8],
      ],
      1,
      7.5,
      palette.body,
    );
    face(
      [
        [cx - 2, -16, 7.6],
        [cx + 2, -16, 7.6],
        [cx + 2, 12, 7.6],
        [cx - 1, 16, 7.6],
      ],
      palette.mid,
    );
    face(
      [
        [cx - 4, -24.15, 3],
        [cx + 4, -24.15, 3],
        [cx + 4, -24.15, 6.5],
        [cx - 4, -24.15, 6.5],
      ],
      '#08152d',
    );
    face(
      [
        [cx - 3.7, -24.3, 5.5],
        [cx + 3.7, -24.3, 5.5],
        [cx + 3.7, -24.3, 6.6],
        [cx - 3.7, -24.3, 6.6],
      ],
      palette.accent,
    );
    for (const edge of [-1, 1]) {
      const u = cx + edge * 5.05;
      face(
        [
          [u, -18, 5.1],
          [u, 4, 5.1],
          [u, 4, 6.2],
          [u, -18, 6.2],
        ],
        palette.light,
      );
      face(
        [
          [u, 6, 3.5],
          [u, 11, 3.5],
          [u, 11, 5.5],
          [u, 6, 5.5],
        ],
        palette.accent,
      );
    }
    face(
      [
        [cx - 3, 11, 7.8],
        [cx + 3, 11, 7.8],
        [cx + 3, 14, 7.8],
        [cx - 3, 14, 7.8],
      ],
      palette.light,
    );

    const hot = isPlayer ? player.boosting : rivalBoost;
    const flame = 9 + (hot ? 42 : 5) + Math.sin(game.worldTime * 76 + side) * 4;
    face(
      [
        [cx - 3.5, -24.5, 4.8],
        [cx + 3.5, -24.5, 4.8],
        [cx + 2, -28 - flame * 0.45, 4.8],
        [cx, -28 - flame, 4.8],
        [cx - 2, -28 - flame * 0.45, 4.8],
      ],
      hot ? '#5ce3ff' : '#ffb191',
      0.92,
    );
    face(
      [
        [cx - 1.8, -24.8, 5],
        [cx + 1.8, -24.8, 5],
        [cx, -28 - flame * 0.76, 5],
      ],
      '#f1fdff',
    );
  }

  // A raised glass canopy gives the low side view a distinct profile.
  const base: Vertex3[] = [
    [-5, -8, 7.5],
    [5, -8, 7.5],
    [4, 13, 7.5],
    [-4, 13, 7.5],
  ];
  const roof: Vertex3[] = [
    [-3.6, -5, 14],
    [3.6, -5, 14],
    [2.8, 8, 13],
    [-2.8, 8, 13],
  ];
  face(roof, palette.glass);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face([base[i], base[j], roof[j], roof[i]], i === 0 ? palette.dark : palette.glass);
  }
  face(
    [
      [-4.8, -5, 9],
      [-3.5, -4, 13.7],
      [-2.8, 6, 13],
      [-4, 10, 9],
    ],
    palette.light,
    0.55,
  );
  face(
    [
      [4.8, -5, 9],
      [3.5, -4, 13.7],
      [2.8, 6, 13],
      [4, 10, 9],
    ],
    palette.light,
    0.55,
  );
  face(
    [
      [-3.6, -4, 14.1],
      [-2, -4, 14.1],
      [-1.3, 7, 13.2],
      [-2.8, 7, 13.2],
    ],
    palette.light,
  );
  face(
    [
      [-6, -14, 7.3],
      [6, -14, 7.3],
      [6, -12, 7.3],
      [-6, -12, 7.3],
    ],
    palette.light,
  );
  face(
    [
      [-3, -18, 7.4],
      [3, -18, 7.4],
      [3, -16, 7.4],
      [-3, -16, 7.4],
    ],
    '#ffffff',
  );

  // Painter's algorithm: far faces first.
  faces.sort((a, b) => b.depth - a.depth);
  for (const f of faces) {
    ctx.save();
    ctx.globalAlpha *= f.alpha;
    polygon(
      ctx,
      f.pts.map((v) => [v.x, v.y] as Point2),
      f.fill,
    );
    ctx.restore();
  }
  ctx.restore();
}
