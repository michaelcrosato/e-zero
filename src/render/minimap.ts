/**
 * Course map.
 *
 * Drawn on its own small canvas at HUD refresh rate (25 Hz) rather than every
 * frame. Shows the full lap, the portion completed, every rival, and the
 * player's heading.
 */
import { TAU } from '../config/constants';
import { mod } from '../core/math';
import { rivals } from '../sim/rivals';
import { player } from '../sim/state';
import { N, sample, total, track } from '../track/spline';
import { el } from '../ui/dom';
import { shipPalettes } from './palettes';
import { polygon } from './sprites';
import { online, remoteCraft } from '../online/state';

const MAP_W = 264;
const MAP_H = 208;

const mapCtx = el.minimap.getContext('2d');

const bounds = track.reduce(
  (b, p) => ({
    minX: Math.min(b.minX, p.x),
    maxX: Math.max(b.maxX, p.x),
    minY: Math.min(b.minY, p.y),
    maxY: Math.max(b.maxY, p.y),
  }),
  { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
);

export function drawMinimap(): void {
  const c = mapCtx;
  if (!c) return;
  c.clearRect(0, 0, MAP_W, MAP_H);

  const scale = Math.min(218 / (bounds.maxX - bounds.minX), 177 / (bounds.maxY - bounds.minY));
  const ox = (MAP_W - (bounds.maxX - bounds.minX) * scale) / 2;
  const oy = 14;
  const toX = (x: number): number => ox + (x - bounds.minX) * scale;
  const toY = (y: number): number => oy + (y - bounds.minY) * scale;

  c.lineJoin = 'round';
  c.lineCap = 'round';

  // Course outline: a dark casing stroke under a lighter road stroke.
  c.beginPath();
  for (let i = 0; i < N; i += 7) {
    const p = track[i];
    if (i) c.lineTo(toX(p.x), toY(p.y));
    else c.moveTo(toX(p.x), toY(p.y));
  }
  c.closePath();
  c.strokeStyle = '#071324da';
  c.lineWidth = 12;
  c.stroke();
  c.strokeStyle = '#a8cfe691';
  c.lineWidth = 5;
  c.stroke();

  // Completed portion of the current lap.
  const end = Math.floor((mod(player.s, total) / total) * N);
  c.beginPath();
  for (let i = 0; i < end; i += 5) {
    const p = track[i];
    if (i) c.lineTo(toX(p.x), toY(p.y));
    else c.moveTo(toX(p.x), toY(p.y));
  }
  c.strokeStyle = '#d5ff64';
  c.lineWidth = 4;
  c.stroke();

  const start = sample(0);
  c.fillStyle = '#e8effc';
  c.fillRect(toX(start.x) - 5, toY(start.y) - 2, 10, 3);

  for (const r of online.racing ? remoteCraft : rivals) {
    const p = sample(r.s, r.x);
    c.beginPath();
    c.arc(toX(p.x), toY(p.y), 2.3, 0, TAU);
    c.fillStyle = shipPalettes[r.color].body;
    c.fill();
  }

  const p = sample(player.s);
  c.save();
  c.translate(toX(p.x), toY(p.y));
  c.rotate(p.angle + Math.PI / 2);
  polygon(
    c,
    [
      [0, -8],
      [5, 5],
      [0, 3],
      [-5, 5],
    ],
    '#ffffff',
  );
  c.restore();
}
