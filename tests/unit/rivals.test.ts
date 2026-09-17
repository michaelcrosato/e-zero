import { beforeEach, describe, expect, it } from 'vitest';
import { FIELD_SIZE } from '../../src/config/constants';
import { shipPalettes } from '../../src/render/palettes';
import { livePosition, resetRivals, rivals, roadPosition } from '../../src/sim/rivals';
import { game, player } from '../../src/sim/state';
import { widthAt } from '../../src/track/layout';

beforeEach(() => {
  resetRivals();
  player.s = 0;
  player.x = 0;
  game.fieldTime = 0;
});

describe('rival field', () => {
  it('fills the grid behind the player', () => {
    expect(rivals).toHaveLength(FIELD_SIZE - 1);
    expect(new Set(rivals.map((r) => r.id)).size).toBe(FIELD_SIZE - 1);
  });

  it('assigns every rival a valid livery', () => {
    for (const r of rivals) {
      expect(r.color).toBeGreaterThanOrEqual(0);
      expect(r.color).toBeLessThan(shipPalettes.length);
      expect(shipPalettes[r.color]).toBeDefined();
    }
  });

  it('starts every rival ahead of the player and inside the road', () => {
    for (const r of rivals) {
      expect(r.startS).toBeGreaterThan(0);
      expect(Math.abs(r.x)).toBeLessThan(widthAt(r.startS));
    }
  });

  it('is a genuine ladder: the front of the grid is quicker than the back', () => {
    const front = rivals[rivals.length - 1];
    const back = rivals[0];
    expect(front.pace).toBeGreaterThan(back.pace);
    // Pace must stay in a sane band, or the field would either stall or vanish.
    for (const r of rivals) {
      expect(r.pace).toBeGreaterThan(0.9);
      expect(r.pace).toBeLessThan(1.2);
    }
  });

  it('staggers the grid into three columns so there are gaps to pass through', () => {
    const lanes = new Set(rivals.map((r) => r.lane));
    expect(lanes.size).toBe(3);
    expect([...lanes].sort((a, b) => a - b)).toEqual([-0.7, 0, 0.7]);
  });

  it('gives every rival a boost plan that fires but is not permanent', () => {
    for (const r of rivals) {
      expect(r.boostDuration).toBeGreaterThan(0);
      expect(r.boostDuration).toBeLessThan(r.boostPeriod);
      expect(r.boostRatio).toBeGreaterThan(1);
    }
  });
});

describe('resetRivals', () => {
  it('returns the whole field to the grid', () => {
    for (const r of rivals) {
      r.s = 12345;
      r.v = 99;
      r.finishedAt = 7;
      r.boosting = true;
    }
    resetRivals();
    for (const r of rivals) {
      expect(r.s).toBe(r.startS);
      expect(r.x).toBe(r.baseX);
      expect(r.v).toBe(0);
      expect(r.finishedAt).toBeNull();
      expect(r.boosting).toBe(false);
    }
  });
});

describe('position reporting', () => {
  it('puts the player last on the grid', () => {
    expect(livePosition()).toBe(FIELD_SIZE);
    expect(roadPosition()).toBe(FIELD_SIZE);
  });

  it('puts the player first once past the whole field', () => {
    player.s = 1e9;
    expect(livePosition()).toBe(1);
    expect(roadPosition()).toBe(1);
  });

  it('counts a finished rival as ahead even after the player passes it on the road', () => {
    player.s = 1e9;
    rivals[0].finishedAt = 12;
    // On the road the player leads; on classification the finisher is ahead.
    expect(roadPosition()).toBe(1);
    expect(livePosition()).toBe(2);
  });

  it('tracks positions monotonically as the player advances', () => {
    let previous = livePosition();
    for (let s = 0; s < 8000; s += 400) {
      player.s = s;
      const current = livePosition();
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });
});
