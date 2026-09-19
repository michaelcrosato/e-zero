/** Shared road, lane markings and AI trajectories for Skyline's twelve sections. */
import { HALF } from '../config/constants';
import { lerp, mod, smooth } from '../core/math';
import { sectionAt, skyline } from './spatial';

export const GRID_COLUMNS = 9;
export const LANE_WIDTH = (HALF * 2) / 3;
export const MERGE_START = 2900;
export const MERGE_END = skyline.sections[5].end;

// Adjacent groups merge alternately across the road, leaving three groups of three.
const DROP_ORDER = [1, 8, 4, 2, 7, 5];
const laneStates = Array.from({ length: GRID_COLUMNS + 1 }, (_, count) => {
  const removed = new Set(DROP_ORDER.slice(0, GRID_COLUMNS - count));
  const groups = [0];
  for (let column = 1; column < GRID_COLUMNS; column++)
    groups.push(groups[column - 1] + (removed.has(column) ? 0 : 1));
  return {
    centres: groups.map((group) => (group - (count - 1) / 2) * LANE_WIDTH),
    dividers: Array.from({ length: GRID_COLUMNS - 1 }, (_, i) => ({
      x: (groups[i] - (count - 1) / 2 + (removed.has(i + 1) ? 0 : 0.5)) * LANE_WIDTH,
      visible: removed.has(i + 1) ? 0 : 1,
    })),
  };
});

/** Fractional lane count describes a continuous physical taper, never a width jump. */
export function skylineLaneUnitsAt(s: number): number {
  const part = sectionAt(s);
  let d = mod(s, skyline.length);
  if (part.index === 1) {
    if (d > part.end) d -= skyline.length;
    if (d < 0) return lerp(6, 9, smooth((d - part.start) / -part.start));
    return lerp(9, 8, smooth((d - MERGE_START) / (part.end * 0.95 - MERGE_START)));
  }
  const t = (d - part.start) / (part.end - part.start);
  // One long merge per opening section; later widths settle before each feature's apex.
  const blend = part.index <= 6 ? smooth((t - 0.2) / 0.65) : smooth(t / 0.45);
  return lerp(part.entryLanes, part.lanes, blend);
}

export const skylineWidthAt = (s: number): number => (skylineLaneUnitsAt(s) * LANE_WIDTH) / 2;
export const skylineLaneCountAt = (s: number): number => Math.ceil(skylineLaneUnitsAt(s) - 1e-9);

/** Stable IDs let each removed divider fade as its neighbouring lanes join. */
export function skylineDividerAt(s: number, divider: number): { x: number; opacity: number } {
  const lanes = skylineLaneUnitsAt(s);
  const low = Math.floor(lanes);
  const high = Math.ceil(lanes);
  const a = laneStates[low].dividers[divider];
  const b = laneStates[high].dividers[divider];
  return { x: lerp(a.x, b.x, lanes - low), opacity: lerp(a.visible, b.visible, lanes - low) };
}

/** Continuous lane preferences keep merged pairs together, including subsequent splits. */
export function skylineLaneAt(s: number, column: number): number {
  const lanes = skylineLaneUnitsAt(s);
  const low = Math.floor(lanes);
  const x = lerp(
    laneStates[low].centres[column],
    laneStates[Math.ceil(lanes)].centres[column],
    lanes - low,
  );
  return x / ((lanes * LANE_WIDTH) / 2 - 24);
}

export function skylineGrid(index: number): { s: number; x: number; lane: number } {
  const column = index % GRID_COLUMNS;
  const s = 96 + Math.floor(index / GRID_COLUMNS) * 237 + column * 12;
  const lane = skylineLaneAt(s, column);
  return { s, x: lane * (skylineWidthAt(s) - 24), lane };
}
