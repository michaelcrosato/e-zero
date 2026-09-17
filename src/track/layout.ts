/**
 * Course layout: how wide the road is, where its features sit, and the pace
 * constants that derive from its length.
 */
import { BOOST_RATIO, HALF, RACE_LAPS } from '../config/constants';
import { mod } from '../core/math';
import { total } from './spline';

/** Base cruising speed in world units/second: a clean lap takes ~29.7s. */
export const BASE = total / 29.7;
/** Top speed under boost. */
export const MAX = BASE * BOOST_RATIO;
/** Full race distance across all laps. */
export const RACE_DISTANCE = total * RACE_LAPS;

interface WideSection {
  /** Position along the lap, as a fraction of `total`. */
  at: number;
  /** Half-length of the flare, as a fraction of `total`. */
  span: number;
  /** Extra half-width at the centre of the flare, in world units. */
  extra: number;
}

/** Sections where the road opens out, giving the pack room to fan out. */
const WIDE_SECTIONS: readonly WideSection[] = [
  { at: 0.17, span: 0.115, extra: 68 },
  { at: 0.47, span: 0.155, extra: 96 },
  { at: 0.765, span: 0.095, extra: 62 },
];

/** Half-width of the road at course distance `s`, in world units. */
export function widthAt(s: number): number {
  const f = mod(s, total) / total;
  let width = HALF;
  for (const w of WIDE_SECTIONS) {
    const d = Math.min(Math.abs(f - w.at), 1 - Math.abs(f - w.at));
    if (d < w.span) width += w.extra * (0.5 + 0.5 * Math.cos((Math.PI * d) / w.span));
  }
  return width;
}

export interface BoostPad {
  /** Centre of the pad along the course. */
  s: number;
  /** Lateral offset of the pad centre. */
  x: number;
  /** Length along the course. */
  len: number;
}

/** Cyan strips that kick the craft up to boost speed. */
export const pads: readonly BoostPad[] = [
  { s: total * 0.168, x: 38, len: 290 },
  { s: total * 0.654, x: -26, len: 290 },
];

/** The pink strip that refills the shared power supply. */
export const repair = { s: total * 0.397, len: 980, width: 50 } as const;

/** Lateral centre of the repair strip, which hugs the inside edge. */
export const repairX = (s: number): number => -widthAt(s) + 39;
