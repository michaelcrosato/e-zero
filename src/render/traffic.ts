import { mod } from '../core/math';

interface TrafficCraft {
  id: string | number;
  s: number;
  x: number;
  v: number;
  color: number;
}
export interface TrafficContact {
  id: string | number;
  lateral: number;
  ahead: number;
  closingSpeed: number;
  approaching: boolean;
  alongside: boolean;
  color: number;
}

/** Track-relative distance keeps the display continuous as either craft crosses the lap seam. */
export function senseTraffic(
  pilot: { s: number; x: number; v: number },
  field: readonly TrafficCraft[],
  lapLength: number,
): TrafficContact[] {
  const contacts: TrafficContact[] = [];
  for (const car of field) {
    const ahead = mod(car.s - pilot.s + lapLength / 2, lapLength) - lapLength / 2;
    const lateral = car.x - pilot.x;
    if (Math.abs(ahead) > 360 || Math.abs(lateral) > 240) continue;
    const closingSpeed = car.v - pilot.v;
    contacts.push({
      id: car.id,
      lateral,
      ahead,
      closingSpeed,
      approaching: ahead < -20 && closingSpeed > 5 && -ahead / closingSpeed < 4,
      alongside: Math.abs(ahead) <= 55 && Math.abs(lateral) < 120,
      color: car.color,
    });
  }
  return contacts;
}
