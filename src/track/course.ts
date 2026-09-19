import { vec, type Frame3 } from '../core/vector';
import { sample, total } from './spline';
import { sampleSpatial, skyline } from './spatial';
import { widthAt, pads, repair } from './layout';
import { RACE_LAPS } from '../config/constants';
import { skylineWidthAt } from './launch';

export type CourseId = 'classic' | 'skyline';
export const course = { id: 'classic' as CourseId };
export const courseNames: Record<CourseId, string> = {
  classic: 'NEON HARBOR',
  skyline: 'SKYLINE CIRCUIT',
};
export const isCourse = (value: unknown): value is CourseId =>
  value === 'classic' || value === 'skyline';

export const courseLength = (): number => (course.id === 'skyline' ? skyline.length : total);
export const raceDistance = (): number => courseLength() * RACE_LAPS;
export const skylinePads = pads.map((pad) => ({ ...pad, s: (pad.s / total) * skyline.length }));
export const skylineRepair = { ...repair, s: (repair.s / total) * skyline.length };
export const coursePads = () => (course.id === 'skyline' ? skylinePads : pads);
export const courseRepair = () => (course.id === 'skyline' ? skylineRepair : repair);

export function courseWidthAt(s: number): number {
  return course.id === 'skyline' ? skylineWidthAt(s) : widthAt(s);
}

export const courseRepairX = (s: number): number => -courseWidthAt(s) + 39;

export function sampleCourse(s: number, lateral = 0): Frame3 {
  if (course.id === 'skyline') return sampleSpatial(s, lateral);
  const p = sample(s, lateral);
  return {
    ...p,
    z: 0,
    bank: 0,
    forward: vec(Math.cos(p.angle), Math.sin(p.angle)),
    right: vec(-Math.sin(p.angle), Math.cos(p.angle)),
    up: vec(0, 0, 1),
  };
}

/** Gravity resolved in the road's frame; magnetic adhesion supplies the normal force. */
export const GRAVITY = 360;
export function gradeAcceleration(frame: Frame3): number {
  return -GRAVITY * frame.forward.z;
}
export function lateralDrift(frame: Frame3, speed: number): number {
  const gravity = course.id === 'skyline' ? -GRAVITY * 0.35 * frame.right.z : 0;
  return Math.max(-195, Math.min(195, -frame.curve * speed * speed * 0.1 + gravity));
}
