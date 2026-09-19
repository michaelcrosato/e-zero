import {
  MAX_PLAYERS,
  PROTOCOL,
  newRacer,
  type Message,
  type Motion,
  type Phase,
  type Racer,
} from './protocol';

import type { CourseId } from '../track/course';

/** Host-owned membership and race lifecycle, independent of the transport. */
export class Room {
  phase: Phase = 'lobby';
  round = 0;
  racers: Racer[];

  constructor(
    id: string,
    name: string,
    readonly course: CourseId = 'classic',
  ) {
    this.racers = [newRacer(id, name, 0)];
  }

  join(id: string, name: string, version: number): string | null {
    if (version !== PROTOCOL) return 'Different game version. Refresh and try again.';
    if (this.phase !== 'lobby') return 'This race has already started. Join the next race.';
    if (this.racers.length >= MAX_PLAYERS) return 'Room is full (4 players).';
    if (this.racers.some((r) => r.id === id)) return 'Already connected to this room.';
    const slot = [0, 1, 2, 3].find((s) => !this.racers.some((r) => r.slot === s));
    if (slot === undefined) return 'Room is full (4 players).';
    this.racers.push(newRacer(id, name, slot));
    return null;
  }

  ready(id: string, ready: boolean): void {
    const racer = this.racers.find((r) => r.id === id);
    if (this.phase === 'lobby' && racer) racer.ready = ready;
  }

  get canStart(): boolean {
    return (
      this.phase === 'lobby' &&
      this.racers.length >= 2 &&
      this.racers.every((r) => r.ready && r.connected)
    );
  }

  start(): boolean {
    if (!this.canStart) return false;
    this.round++;
    this.phase = 'racing';
    this.racers = this.racers.map((r) => ({ ...newRacer(r.id, r.name, r.slot), ready: true }));
    return true;
  }

  motion(id: string, round: number, motion: Motion): void {
    const racer = this.racers.find((r) => r.id === id);
    if (
      this.phase !== 'racing' ||
      round !== this.round ||
      !racer ||
      !racer.connected ||
      racer.failed ||
      racer.finishedAt !== null ||
      motion.seq <= racer.seq
    )
      return;
    // Copy only motion fields: an untrusted packet must never rename a member or steal a slot.
    racer.s = motion.s;
    racer.x = motion.x;
    racer.v = motion.v;
    racer.boosting = motion.boosting;
    racer.finishedAt = motion.finishedAt;
    racer.failed = motion.failed;
    racer.seq = motion.seq;
    this.checkFinish();
  }

  leave(id: string): void {
    if (this.phase === 'lobby') this.racers = this.racers.filter((r) => r.id !== id);
    else {
      const racer = this.racers.find((r) => r.id === id);
      if (racer) racer.connected = false;
      this.checkFinish();
    }
  }

  private checkFinish(): void {
    if (this.racers.every((r) => r.finishedAt !== null || r.failed || !r.connected))
      this.phase = 'finished';
  }

  rematch(): boolean {
    if (this.phase !== 'finished') return false;
    this.phase = 'lobby';
    this.racers = this.racers.filter((r) => r.connected).map((r) => newRacer(r.id, r.name, r.slot));
    return true;
  }

  message(): Message {
    return {
      type: 'room',
      course: this.course,
      phase: this.phase,
      round: this.round,
      racers: this.racers.map((r) => ({ ...r })),
    };
  }
}
