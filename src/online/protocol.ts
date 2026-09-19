/** Small, versioned messages; never trust objects received from another browser. */
import { isCourse, type CourseId } from '../track/course';
import { HALF } from '../config/constants';
export const PROTOCOL = 3;
export const MAX_PLAYERS = 4;
export const ROOM_PATTERN = /^[A-Z2-9]{8}$/;

export interface Racer {
  id: string;
  name: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  s: number;
  x: number;
  v: number;
  boosting: boolean;
  finishedAt: number | null;
  failed: boolean;
  seq: number;
}

export type Motion = Pick<Racer, 's' | 'x' | 'v' | 'boosting' | 'finishedAt' | 'failed' | 'seq'>;
export type Phase = 'lobby' | 'racing' | 'finished';
export type Message =
  | { type: 'hello'; version: number; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'ping'; sent: number }
  | { type: 'pong'; sent: number; hostTime: number }
  | { type: 'state'; round: number; motion: Motion }
  | { type: 'room'; phase: Phase; round: number; racers: Racer[]; course: CourseId }
  | { type: 'start'; round: number; at: number; racers: Racer[]; course: CourseId }
  | { type: 'reject'; reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return bounded(value, 0, max) && Number.isInteger(value);
}
export function isMotion(value: unknown): value is Motion {
  return (
    record(value) &&
    bounded(value.s, 0, 1e9) &&
    bounded(value.x, -2000, 2000) &&
    bounded(value.v, 0, 10000) &&
    typeof value.boosting === 'boolean' &&
    typeof value.failed === 'boolean' &&
    integer(value.seq) &&
    (value.finishedAt === null || bounded(value.finishedAt, 0, 86400))
  );
}
function isRacer(value: unknown): value is Racer {
  return (
    record(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 16 &&
    integer(value.slot, 3) &&
    typeof value.ready === 'boolean' &&
    typeof value.connected === 'boolean' &&
    isMotion(value)
  );
}
function isRoster(value: unknown): value is Racer[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= MAX_PLAYERS &&
    value.every(isRacer) &&
    new Set(value.map((r) => r.id)).size === value.length &&
    new Set(value.map((r) => r.slot)).size === value.length
  );
}
export function parseMessage(value: unknown): Message | null {
  if (!record(value)) return null;
  switch (value.type) {
    case 'hello':
      if (integer(value.version) && typeof value.name === 'string' && value.name.length <= 16)
        return value as Message;
      break;
    case 'ready':
      if (typeof value.ready === 'boolean') return value as Message;
      break;
    case 'ping':
      if (bounded(value.sent, 0, 1e12)) return value as Message;
      break;
    case 'pong':
      if (bounded(value.sent, 0, 1e12) && bounded(value.hostTime, 0, 1e12)) return value as Message;
      break;
    case 'state':
      if (integer(value.round) && isMotion(value.motion)) return value as Message;
      break;
    case 'room':
      if (
        (value.phase === 'lobby' || value.phase === 'racing' || value.phase === 'finished') &&
        integer(value.round) &&
        isRoster(value.racers) &&
        isCourse(value.course)
      )
        return value as Message;
      break;
    case 'start':
      if (
        integer(value.round) &&
        bounded(value.at, 0, 1e12) &&
        isRoster(value.racers) &&
        isCourse(value.course)
      )
        return value as Message;
      break;
    case 'reject':
      if (typeof value.reason === 'string' && value.reason.length <= 160) return value as Message;
  }
  return null;
}

export function newRacer(
  id: string,
  name: string,
  slot: number,
  course: CourseId = 'classic',
): Racer {
  return {
    id,
    name: name.trim().slice(0, 16) || `PLAYER ${slot + 1}`,
    slot,
    ready: slot === 0,
    connected: true,
    s: 0,
    x: (slot - 1.5) * (course === 'skyline' ? (HALF * 2) / 3 : 42),
    v: 0,
    boosting: false,
    finishedAt: null,
    failed: false,
    seq: 0,
  };
}

/** Finishers first, active racers by distance, then power-outs/disconnects. */
export function compareRacers(a: Racer, b: Racer): number {
  if (a.finishedAt !== null || b.finishedAt !== null)
    return (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity) || a.slot - b.slot;
  return (
    Number(a.failed || !a.connected) - Number(b.failed || !b.connected) ||
    b.s - a.s ||
    a.slot - b.slot
  );
}
