import { FIELD_SIZE } from '../config/constants';
import { compareRacers, type Phase, type Racer } from './protocol';

/** DOM-free view shared by networking, the simulation and renderer. */
export const online = {
  active: false,
  racing: false,
  phase: 'lobby' as Phase,
  id: '',
  host: false,
  code: '',
  round: 0,
  racers: [] as Racer[],
};

export const onlineActions = { leave: (): void => {} };

export const remoteCraft: Array<{
  id: string;
  s: number;
  x: number;
  v: number;
  color: number;
  boosting: boolean;
}> = [];

export function fieldSize(): number {
  return online.racing ? online.racers.length : FIELD_SIZE;
}

export function onlinePosition(): number {
  return (
    online.racers
      .slice()
      .sort(compareRacers)
      .findIndex((r) => r.id === online.id) + 1
  );
}

/** Smooth packet spacing without predicting through a disconnected racer. */
export function updateRemoteCraft(dt: number): void {
  for (const craft of remoteCraft) {
    const racer = online.racers.find((r) => r.id === craft.id);
    if (!racer) continue;
    craft.s += (racer.s - craft.s) * Math.min(1, dt * 16);
    craft.x += (racer.x - craft.x) * Math.min(1, dt * 16);
    craft.v = racer.v;
    craft.boosting = racer.boosting;
  }
}

export function syncRemoteCraft(): void {
  for (let i = remoteCraft.length - 1; i >= 0; i--) {
    if (!online.racers.some((r) => r.id === remoteCraft[i].id && r.connected))
      remoteCraft.splice(i, 1);
  }
  for (const racer of online.racers) {
    if (racer.id === online.id || !racer.connected) continue;
    if (!remoteCraft.some((c) => c.id === racer.id))
      remoteCraft.push({
        id: racer.id,
        s: racer.s,
        x: racer.x,
        v: racer.v,
        color: racer.slot,
        boosting: racer.boosting,
      });
  }
}
