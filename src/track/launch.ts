/** Skyline's physical six-lane launch apron and three staggered lane merges. */
import { HALF } from '../config/constants';
import { lerp, mod, smooth } from '../core/math';
import { widthAt } from './layout';
import { total } from './spline';

export const MERGE_START = total * 0.11;
export const MERGE_END = total * 0.25;
const MERGE_LENGTH = (MERGE_END - MERGE_START) / 3;

function mergeDistance(s: number): number {
  const d = mod(s, total);
  // Reopen before the finish so the physical road closes smoothly across every lap.
  return d > total * 0.9 ? lerp(MERGE_END, MERGE_START, smooth((d / total - 0.9) / 0.09)) : d;
}

/** Left pair, right pair, then centre pair; each becomes one normal racing lane. */
export function laneMergeAt(s: number, pair: number): number {
  const order = pair === 1 ? 2 : pair === 2 ? 1 : 0;
  return smooth((mergeDistance(s) - MERGE_START) / MERGE_LENGTH - order);
}

export function skylineWidthAt(s: number): number {
  const d = mergeDistance(s);
  const merged = laneMergeAt(s, 0) + laneMergeAt(s, 1) + laneMergeAt(s, 2);
  // Keep the launch taper monotonic, then blend back into the original three-lane flares.
  return HALF * (2 - merged / 3) + (widthAt(s) - HALF) * smooth((d - MERGE_END) / (total * 0.04));
}

export function skylineLaneCountAt(s: number): number {
  return 3 + [0, 1, 2].filter((pair) => laneMergeAt(s, pair) < 1).length;
}

/** Stable divider IDs keep mesh strips connected while individual lanes disappear. */
export function skylineDividerAt(s: number, divider: number): number | null {
  const width = skylineWidthAt(s);
  if (divider < 2) return (divider === 0 ? -width : width) / 3;
  const pair = divider - 2;
  const merged = laneMergeAt(s, pair);
  if (merged === 1) return null;
  const from = (pair - 1) * (2 / 3);
  const to = pair === 0 ? -1 : pair === 2 ? 1 : -1 / 3;
  return lerp(from, to, merged) * width;
}

/** Lane preference in the AI's normalized usable-width coordinates. */
export function skylineLaneAt(s: number, column: number): number {
  const pair = Math.floor(column / 2);
  const fraction = lerp((column - 2.5) / 3, ((pair - 1) * 2) / 3, laneMergeAt(s, pair));
  const width = skylineWidthAt(s);
  return (fraction * width) / (width - 24);
}

export function skylineGrid(index: number): { s: number; x: number; lane: number } {
  const column = index % 6;
  // Twice the row spacing keeps the same grid length while doubling lateral capacity.
  const s = 96 + Math.floor(index / 6) * 158 + column * 12;
  const lane = skylineLaneAt(s, column);
  return { s, x: lane * (skylineWidthAt(s) - 24), lane };
}
