/**
 * Mutable race state.
 *
 * These live in objects rather than module-level `let` bindings so that every
 * module observes the same values without relying on live-binding semantics,
 * and so a reset can rewrite the world in place without swapping references.
 */
import { BEST_KEY, FIELD_SIZE, SKY_H } from '../config/constants';
import { total } from '../track/spline';
import { course } from '../track/course';
import type { BoostParticle, Camera, LapResult, Mode, Player, Spark } from './types';

export function createPlayer(): Player {
  return {
    s: 0,
    x: 0,
    v: 0,
    latV: 0,
    kickV: 0,
    bounceTime: 0,
    railLock: 0,
    railHits: 0,
    power: 100,
    steer: 0,
    pad: 0,
    impact: 0,
    topSpeed: 0,
    boosting: false,
    boostLock: false,
  };
}

function bestKey(): string {
  return course.id === 'classic' ? BEST_KEY : BEST_KEY + '-skyline-v3';
}

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(bestKey())) || 0;
  } catch {
    // Private browsing and blocked storage are not errors; there is just no best.
    return 0;
  }
}

/** The player's craft. Mutated in place; never reassigned. */
export const player: Player = createPlayer();

export const camera: Camera = {
  x: 0,
  y: 0,
  angle: 0,
  horizon: SKY_H,
  height: 59,
  focal: 334,
};

export const game = {
  mode: 'title' as Mode,
  /** Mode to return to when the pause overlay is dismissed. */
  pausedMode: 'race' as Mode,

  raceTime: 0,
  countTime: 0,
  lastCount: -1,
  worldTime: 0,
  /** Course position of the attract-mode camera on the title screen. */
  demoS: total * 0.085,

  shake: 0,
  damage: 0,
  messageTime: 0,
  messageText: '',
  finishDelay: 0,

  freeLapTime: 0,
  lastFreeTime: 0,
  cinemaAge: 0,
  cameraBlend: 0,
  cameraYaw: 0,
  finishAge: 0,

  lapTimes: [] as number[],
  lapStartTime: 0,
  /** Last position announced, so "+10 places" messages do not repeat. */
  placesNotice: FIELD_SIZE,
  lastPass: FIELD_SIZE,
  displayPosition: FIELD_SIZE,

  best: loadBest(),
  lapResult: null as LapResult | null,

  hudTick: 0,
  /** Per-pad cooldowns, so one pad cannot fire every step. */
  padLock: [0, 0] as number[],

  trafficClock: 0,
  fieldTime: 0,
};

/** Screen-space collision sparks. */
export const sparkParticles: Spark[] = [];

/** Boost thruster trail, in screen space. */
export const boostFX = {
  amount: 0,
  burst: 0,
  cooldown: 0,
  age: 0,
  active: false,
  emit: 0,
  particles: [] as BoostParticle[],
};

/** Held keyboard codes. */
export const held = new Set<string>();

/** Touch control latches. */
export const touch = {
  left: false,
  right: false,
  boost: false,
  brake: false,
  lookLeft: false,
  lookRight: false,
};

export function setBest(value: number): void {
  game.best = value;
  try {
    localStorage.setItem(bestKey(), String(value));
  } catch {
    // A best time that cannot be persisted is still valid for this session.
  }
}
