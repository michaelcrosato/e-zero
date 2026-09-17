/** Shared simulation types. */

/** Every screen the game can be in. */
export type Mode =
  'title' | 'countdown' | 'race' | 'finishing' | 'victory' | 'free' | 'paused' | 'results';

/** Modes in which the simulation is running and music should play. */
export const ACTIVE_MODES: readonly Mode[] = ['countdown', 'race', 'finishing', 'victory', 'free'];
/** Modes that can be paused. */
export const PAUSABLE_MODES: readonly Mode[] = ['race', 'countdown', 'free', 'victory'];

export interface Player {
  /** Distance travelled along the course, in world units. Never wraps. */
  s: number;
  /** Lateral offset from the centre line. */
  x: number;
  /** Forward speed, world units/second. */
  v: number;
  /** Steering-driven lateral velocity. */
  latV: number;
  /** Collision-driven lateral velocity. Steering cannot cancel it. */
  kickV: number;
  /** Time left in the reduced-authority window after a rail hit. */
  bounceTime: number;
  /** Cooldown that stops a single rail contact retriggering every step. */
  railLock: number;
  railHits: number;
  /** Shared supply for boosting; also the damage pool. */
  power: number;
  /** Smoothed steering input, -1..1. */
  steer: number;
  /** Time left on a boost-pad kick. */
  pad: number;
  /** Cooldown after touching a rival. */
  impact: number;
  topSpeed: number;
  boosting: boolean;
  /** Set when power runs out; blocks boost until the button is released. */
  boostLock: boolean;
}

export interface Rival {
  id: number;
  name: string;
  startS: number;
  s: number;
  x: number;
  baseX: number;
  /** Preferred lane, -1..1, as a fraction of the usable half-width. */
  lane: number;
  targetLane: number;
  v: number;
  /** Speed multiplier relative to BASE. */
  pace: number;
  /** Index into the ship palette list. */
  color: number;
  /** Per-rival offset that desynchronises the idle weave. */
  phase: number;
  acceleration: number;
  /** Throttle scale imposed by the car ahead, 0..1. */
  traffic: number;
  /** Time before this rival may pick a new lane again. */
  laneHold: number;
  /** Field time at which it crossed the finish, or null. */
  finishedAt: number | null;
  boosting: boolean;
  boostRatio: number;
  boostPeriod: number;
  boostDuration: number;
  launchBoost: number;
}

export interface LapResult {
  time: number;
  position: number;
  top: number;
  power: number;
  failed: boolean;
  newBest: boolean;
  fieldSize: number;
  totalLaps: number;
  laps: number[];
  positionsGained: number;
}

export interface Camera {
  x: number;
  y: number;
  angle: number;
  horizon: number;
  height: number;
  focal: number;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

export interface BoostParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export type SceneryKind = 'orb' | 'sign' | 'gate';

export interface Scenery {
  wx: number;
  wy: number;
  type: SceneryKind;
  height: number;
  /** Course distance. Present for signs and the gate. */
  s?: number;
  /** Sign caption. */
  text?: string;
  /** Rail spheres alternate colour. */
  pink?: boolean;
}
