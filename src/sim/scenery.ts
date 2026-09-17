/**
 * Static world objects that stand up off the ground plane, so they cannot be
 * part of the baked terrain texture and must be drawn as sorted sprites.
 */
import { RAIL_GAP, RAIL_RADIUS } from '../config/constants';
import { widthAt } from '../track/layout';
import { sample, total } from '../track/spline';
import type { Scenery } from './types';

/** Trackside signs: [lap fraction, side, caption]. */
const SIGNS: ReadonlyArray<readonly [number, number, string]> = [
  [0.055, 1, 'E-ZERO'],
  [0.13, -1, 'WIDE OPEN'],
  [0.24, -1, 'GO FAST'],
  [0.38, -1, 'POWER +'],
  [0.53, 1, 'E-ZERO'],
  [0.635, 1, 'BOOST'],
  [0.72, -1, 'WIDE OPEN'],
  [0.86, -1, 'FINAL RUN'],
];

function build(): Scenery[] {
  const out: Scenery[] = [];

  // Rail spheres down both edges; every fourth socket is a pink marker.
  for (let d = 0, i = 0; d < total; d += RAIL_GAP, i++) {
    for (const side of [-1, 1]) {
      const p = sample(d, side * widthAt(d));
      out.push({ wx: p.x, wy: p.y, type: 'orb', height: RAIL_RADIUS, pink: i % 4 === 0 });
    }
  }

  for (const [f, side, text] of SIGNS) {
    const p = sample(total * f, side * (widthAt(total * f) + 37));
    out.push({ wx: p.x, wy: p.y, s: total * f, type: 'sign', text, height: 57 });
  }

  const gate = sample(0);
  out.push({ s: 0, wx: gate.x, wy: gate.y, type: 'gate', height: 82 });
  return out;
}

export const scenery: ReadonlyArray<Scenery> = build();
