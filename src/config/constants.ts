/**
 * Tunable constants for the race.
 *
 * `COURSE_SCALE` scales the course and travel speed together. Craft size, road
 * markings and rail spacing stay in the original world units so the track reads
 * at the same visual scale regardless of this value.
 */
export const COURSE_SCALE = 3.2;

/** Baked terrain texture is TEX x TEX pixels covering WORLD x WORLD world units. */
export const TEX = 4096;
export const WORLD = 4096 * COURSE_SCALE;
/** World units -> texture pixels. */
export const TS = TEX / WORLD;
export const TAU = Math.PI * 2;

/** Half width of the road at its narrowest, in world units. */
export const HALF = 98;

/** Rail sphere radius and spacing along the course, in world units. */
export const RAIL_RADIUS = 7.5;
export const RAIL_GAP = 24;

export const FIELD_SIZE = 100;
export const RACE_LAPS = 3;

/** Horizon position of the sky band, in the 432-unit reference space. */
export const SKY_H = 126;

/** Boost multiplies world speed, not just the speed readout. */
export const BOOST_RATIO = 2.4;

/** Speed readout scaling: world units/second -> displayed km/h. */
export const KMH = 918 * COURSE_SCALE;

/** localStorage key for the personal best lap. Versioned with the rule set. */
export const BEST_KEY = 'e-zero-best-v5-100-3';

/** Fixed simulation step. Physics always advances in slices of this size. */
export const FIXED_STEP = 1 / 120;
/** Never simulate more than this much wall time in one frame. */
export const MAX_FRAME_TIME = 0.1;
/** Upper bound on catch-up steps, so a stalled tab cannot spiral. */
export const MAX_STEPS_PER_FRAME = 12;
