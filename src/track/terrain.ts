/**
 * Bakes the whole course into one TEX x TEX texture.
 *
 * The ground renderer is a Mode 7 style per-pixel sampler, so everything that
 * lies flat on the world plane - water, city grid, islands, road surface,
 * markings, boost strips, the repair strip and the starting grid - is drawn
 * once into this texture rather than per frame. Only objects that stand up off
 * the plane (craft, rail spheres, signs, the gate) are drawn as sprites.
 */
import { RAIL_GAP, TAU, TEX, TS, WORLD, COURSE_SCALE } from '../config/constants';
import { N, sample, total } from './spline';
import { pads, repair, repairX, widthAt } from './layout';

/** Populated by `initTerrain`. Read by the ground renderer's hot loop. */
export const terrain: { tex32: Uint32Array } = { tex32: new Uint32Array(0) };

type LateralArg = number | ((s: number) => number);

/** Island footprints, in pre-scale units: [x, y, width, height]. */
const ISLANDS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1300, 1220, 600, 380],
  [2040, 1520, 420, 740],
  [1170, 2760, 280, 520],
  [2400, 180, 640, 180],
  [350, 2550, 360, 900],
  [3320, 1160, 430, 1270],
];

export function initTerrain(random: () => number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const tc = canvas.getContext('2d', { willReadFrequently: true });
  if (!tc) throw new Error('E-Zero: 2D canvas context unavailable for the terrain texture.');

  const groundPoly = (points: Array<{ x: number; y: number }>, color: string): void => {
    tc.fillStyle = color;
    tc.beginPath();
    points.forEach((p, i) => (i ? tc.lineTo(p.x, p.y) : tc.moveTo(p.x, p.y)));
    tc.closePath();
    tc.fill();
  };

  /** Fills the band between two lateral offsets over `len` units of course. */
  const strip = (
    s: number,
    len: number,
    left: LateralArg,
    right: LateralArg,
    color: string,
  ): void => {
    const poly: Array<{ x: number; y: number }> = [];
    const steps = Math.max(1, Math.ceil(len / 14));
    for (let i = 0; i <= steps; i++) {
      const d = (len * i) / steps;
      poly.push(sample(s + d, typeof left === 'function' ? left(s + d) : left));
    }
    for (let i = steps; i >= 0; i--) {
      const d = (len * i) / steps;
      poly.push(sample(s + d, typeof right === 'function' ? right(s + d) : right));
    }
    groundPoly(poly, color);
  };

  /** Fills a closed band `extra` units outside the road edge, all the way round. */
  const ribbon = (extra: number, color: string): void => {
    const pts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < N; i += 2)
      pts.push(sample((i * total) / N, -widthAt((i * total) / N) - extra));
    for (let i = N - 1; i >= 0; i -= 2)
      pts.push(sample((i * total) / N, widthAt((i * total) / N) + extra));
    groundPoly(pts, color);
  };

  tc.fillStyle = '#171f3d';
  tc.fillRect(0, 0, TEX, TEX);
  tc.scale(TS, TS);

  // Water and the city grid are drawn here, not loaded as assets.
  tc.lineWidth = 1;
  for (let y = 0; y < WORLD; y += 48) {
    tc.strokeStyle = y % 192 === 0 ? '#34405a' : '#232e4b';
    tc.beginPath();
    tc.moveTo(0, y);
    tc.lineTo(WORLD, y);
    tc.stroke();
  }
  for (let x = 0; x < WORLD; x += 96) {
    tc.strokeStyle = '#26334f';
    tc.beginPath();
    tc.moveTo(x, 0);
    tc.lineTo(x, WORLD);
    tc.stroke();
  }
  for (let i = 0; i < 22000; i++) {
    const x = random() * WORLD;
    const y = random() * WORLD;
    tc.fillStyle = i % 7 === 0 ? '#3b4a6c' : '#243552';
    tc.fillRect(x, y, 5 + random() * 28, 2);
  }

  // Islands and landing decks, seen from the low chase camera.
  for (const island of ISLANDS) {
    const [x, y, w, h] = island.map((v) => v * COURSE_SCALE) as [number, number, number, number];
    tc.fillStyle = '#303049';
    tc.fillRect(x - 10, y - 10, w + 20, h + 20);
    tc.fillStyle = '#162439';
    tc.fillRect(x, y, w, h);
    tc.strokeStyle = '#385568';
    tc.lineWidth = 4;
    tc.strokeRect(x + 12, y + 12, w - 24, h - 24);
    for (let yy = y + 32; yy < y + h - 30; yy += 62) {
      for (let xx = x + 30; xx < x + w - 30; xx += 65) {
        tc.fillStyle = random() > 0.5 ? '#2b3552' : '#202c44';
        tc.fillRect(xx, yy, 43, 40);
        tc.fillStyle = '#435b73';
        tc.fillRect(xx, yy, 43, 3);
        tc.fillStyle = '#60a0b5';
        tc.fillRect(xx + 6, yy + 7, 4, 6);
      }
    }
  }

  // Road bed: offset drop shadow, then the surface build-up outside in.
  tc.save();
  tc.translate(18, 23);
  ribbon(21, '#070e23');
  tc.restore();
  ribbon(15, '#69375d');
  ribbon(9, '#162944');
  ribbon(2, '#bbc9d7');
  ribbon(0, '#565a73');

  // Lane markings and edge dashes.
  for (let d = 0; d < total; d += 36) {
    strip(
      d,
      3,
      (s) => -widthAt(s) + 10,
      (s) => widthAt(s) - 10,
      '#62667d',
    );
    if (Math.floor(d / 36) % 3 === 0) strip(d, 31, -2.2, 2.2, '#a1a6b5');
    for (const side of [-1, 1])
      strip(
        d,
        22,
        (s) => side * (widthAt(s) - 17),
        (s) => side * (widthAt(s) - 14),
        '#d1dae0',
      );
  }

  // Sockets stay visible on the ground beneath the separate rail sphere sprites.
  for (let d = 0; d < total; d += RAIL_GAP) {
    for (const side of [-1, 1]) {
      const p = sample(d, side * widthAt(d));
      tc.fillStyle = '#14203a';
      tc.beginPath();
      tc.arc(p.x, p.y, 9, 0, TAU);
      tc.fill();
    }
  }

  // Cyan strips add speed; the pink strip restores the shared power supply.
  pads.forEach((p) => {
    strip(p.s - p.len / 2, p.len, p.x - 26, p.x + 26, '#1c5b7f');
    strip(p.s - p.len / 2, p.len, p.x - 24, p.x - 22, '#78ffff');
    strip(p.s - p.len / 2, p.len, p.x + 22, p.x + 24, '#78ffff');
    for (let d = -55; d <= 55; d += 26) {
      const s = p.s + d;
      groundPoly(
        [
          sample(s - 9, p.x - 19),
          sample(s + 7, p.x),
          sample(s - 9, p.x + 19),
          sample(s - 1, p.x + 19),
          sample(s + 15, p.x),
          sample(s - 1, p.x - 19),
        ],
        '#afffff',
      );
    }
  });

  strip(
    repair.s,
    repair.len,
    (s) => repairX(s) - 25,
    (s) => repairX(s) + 25,
    '#713f80',
  );
  for (let d = 0; d < repair.len; d += 26)
    strip(
      repair.s + d,
      13,
      (s) => repairX(s) - 25,
      (s) => repairX(s) + 25,
      '#f284ca',
    );
  strip(
    repair.s,
    repair.len,
    (s) => repairX(s) - 26,
    (s) => repairX(s) - 23,
    '#ffd5ef',
  );
  strip(
    repair.s,
    repair.len,
    (s) => repairX(s) + 23,
    (s) => repairX(s) + 26,
    '#ffd5ef',
  );

  // Starting grid chequer, then the run-in stripes behind it.
  const gridHalf = widthAt(0) - 8;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 16; col++) {
      strip(
        -28 + row * 14,
        14,
        -gridHalf + col * ((gridHalf * 2) / 16),
        -gridHalf + (col + 1) * ((gridHalf * 2) / 16),
        (row + col) % 2 ? '#121d32' : '#edf3ec',
      );
    }
  }
  for (let d = 75; d < 430; d += 65) {
    strip(
      total - d,
      23,
      (s) => -widthAt(s) + 25,
      (s) => -widthAt(s) + 39,
      '#d9e1e8',
    );
    strip(
      total - d,
      23,
      (s) => widthAt(s) - 39,
      (s) => widthAt(s) - 25,
      '#d9e1e8',
    );
  }

  tc.setTransform(1, 0, 0, 1, 0, 0);

  const data = tc.getImageData(0, 0, TEX, TEX);
  terrain.tex32 = new Uint32Array(data.data.buffer);
  return canvas;
}
