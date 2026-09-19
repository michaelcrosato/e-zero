import { describe, expect, it } from 'vitest';
import {
  compareRacers,
  newRacer,
  parseMessage,
  PROTOCOL,
  type Motion,
} from '../../src/online/protocol';
import { Room } from '../../src/online/room';

const motion = (seq: number, s = 100): Motion => ({
  seq,
  s,
  x: 0,
  v: 100,
  boosting: false,
  finishedAt: null,
  failed: false,
});

describe('private online rooms', () => {
  it('spreads Skyline players across the wider lanes and preserves their grid on rematch', () => {
    const room = new Room('host', 'Host', 'skyline');
    for (let i = 1; i < 4; i++) {
      room.join(`p${i}`, `Player ${i}`, PROTOCOL);
      room.ready(`p${i}`, true);
    }
    const grid = room.racers.map((r) => r.x);
    expect(grid[3] - grid[0]).toBe(392);
    expect(room.start()).toBe(true);
    expect(room.racers.map((r) => r.x)).toEqual(grid);
    for (const racer of room.racers) room.motion(racer.id, 1, { ...motion(1), finishedAt: 90 });
    expect(room.rematch()).toBe(true);
    expect(room.racers.map((r) => r.x)).toEqual(grid);
  });
  it('publishes the host course and rejects unknown course identifiers', () => {
    const room = new Room('host', 'Host', 'skyline');
    expect(room.message()).toMatchObject({ course: 'skyline' });
    expect(parseMessage(room.message())?.type).toBe('room');
    expect(parseMessage({ ...room.message(), course: 'unknown' })).toBeNull();
    expect(
      parseMessage({ type: 'start', at: 123, round: 1, racers: room.racers, course: 'skyline' })
        ?.type,
    ).toBe('start');
  });
  it('admits four players, requires readiness and rejects late joiners', () => {
    const room = new Room('host', 'Host');
    expect(room.start()).toBe(false);
    for (let i = 1; i <= 3; i++) expect(room.join(`p${i}`, `Player ${i}`, PROTOCOL)).toBeNull();
    expect(room.join('fifth', 'Fifth', PROTOCOL)).toContain('full');
    expect(room.start()).toBe(false);
    for (let i = 1; i <= 3; i++) room.ready(`p${i}`, true);
    expect(room.start()).toBe(true);
    expect(room.round).toBe(1);
    expect(new Set(room.racers.map((r) => r.slot)).size).toBe(4);
    expect(room.join('late', 'Late', PROTOCOL)).toContain('already started');
    expect(room.start()).toBe(false);
  });

  it('binds state to its sender and round, ignores stale packets and locks finished results', () => {
    const room = new Room('host', 'Host');
    room.join('guest', 'Guest', PROTOCOL);
    room.ready('guest', true);
    room.start();
    room.motion('intruder', 1, motion(1, 999));
    room.motion('guest', 0, motion(1, 999));
    expect(room.racers[1].s).toBe(0);
    room.motion('guest', 1, motion(2, 200));
    const forged = { ...motion(3, 200), id: 'host', slot: 0, name: 'Imposter', ready: false };
    room.motion('guest', 1, forged);
    expect(room.racers[1]).toMatchObject({ id: 'guest', slot: 1, name: 'Guest', ready: true });
    room.motion('guest', 1, motion(1, 100));
    expect(room.racers[1].s).toBe(200);
    room.motion('guest', 1, { ...motion(4), finishedAt: 90 });
    room.motion('guest', 1, { ...motion(5), finishedAt: 1 });
    expect(room.racers[1].finishedAt).toBe(90);
    expect(room.phase).toBe('racing');
    room.motion('host', 1, { ...motion(1), finishedAt: 85 });
    expect(room.phase).toBe('finished');
    expect(
      room.racers
        .slice()
        .sort(compareRacers)
        .map((r) => r.id),
    ).toEqual(['host', 'guest']);
    expect(room.rematch()).toBe(true);
    expect(room.racers.every((r) => r.finishedAt === null && r.s === 0)).toBe(true);
    expect(room.canStart).toBe(false);
    room.ready('guest', true);
    room.start();
    room.motion('guest', 1, { ...motion(999), finishedAt: 1 });
    expect(room.racers[1].finishedAt).toBeNull();
    expect(room.round).toBe(2);
  });

  it('reuses lobby slots, retains race disconnects and removes them for rematches', () => {
    const room = new Room('host', 'Host');
    room.join('guest', 'Guest', PROTOCOL);
    room.leave('guest');
    room.join('replacement', 'Replacement', PROTOCOL);
    expect(room.racers[1].slot).toBe(1);
    room.ready('replacement', true);
    room.start();
    expect(room.rematch()).toBe(false);
    room.leave('replacement');
    expect(room.racers[1].connected).toBe(false);
    room.motion('host', 1, { ...motion(1), failed: true });
    expect(room.phase).toBe('finished');
    room.rematch();
    expect(room.racers).toHaveLength(1);
    expect(room.canStart).toBe(false);
  });

  it('orders active racers ahead of DNFs, with deterministic ties', () => {
    const a = newRacer('a', 'A', 0);
    const b = { ...newRacer('b', 'B', 1), s: 1000, failed: true };
    expect(compareRacers(a, b)).toBeLessThan(0);
    expect(compareRacers(a, { ...b, failed: false, s: 0 })).toBeLessThan(0);
    expect(compareRacers(a, { ...b, finishedAt: 90 })).toBeGreaterThan(0);
  });
});

describe('untrusted network messages', () => {
  it('rejects malformed numbers, oversized rosters, duplicate identities and wrong versions', () => {
    for (const s of [NaN, Infinity, -1, '42'])
      expect(parseMessage({ type: 'state', round: 1, motion: { ...motion(1), s } })).toBeNull();
    expect(parseMessage({ type: 'state', round: 1, motion: { ...motion(1), v: -10 } })).toBeNull();
    const racer = newRacer('host', 'Host', 0);
    for (const racers of [[], [racer, racer], Array(5).fill(racer)])
      expect(parseMessage({ type: 'room', round: 1, phase: 'racing', racers })).toBeNull();
    expect(parseMessage({ type: 'start', round: 1, at: Infinity, racers: [racer] })).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(
      parseMessage({ type: 'room', phase: { toString: null }, round: 1, racers: [racer] }),
    ).toBeNull();
    expect(new Room('h', 'Host').join('g', 'Guest', 999)).toContain('version');
    expect(parseMessage({ type: 'state', round: 1, motion: motion(1) })?.type).toBe('state');
  });
});
