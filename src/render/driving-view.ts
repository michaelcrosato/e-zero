import { vehicle, type VehicleBody, type VehicleModel } from '../config/vehicles';
import { add, cross, offset, scale, vec, type Frame3, type Vec3 } from '../core/vector';
import { game, held, player, touch } from '../sim/state';
import { course, sampleCourse, type CourseId } from '../track/course';

export type ViewMode = 'chase' | 'pilot' | 'cockpit';
export const viewModes: readonly ViewMode[] = ['chase', 'pilot', 'cockpit'];
export const viewNames: Record<ViewMode, string> = {
  chase: 'Chase',
  pilot: 'Pilot eye',
  cockpit: 'Cockpit',
};
export const drivingView = { mode: 'chase' as ViewMode, lookYaw: 0 };
export const isViewMode = (value: unknown): value is ViewMode =>
  value === 'chase' || value === 'pilot' || value === 'cockpit';
export const insideView = (): boolean => game.mode !== 'title' && drivingView.mode !== 'chase';

export interface ViewCamera {
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fov: number;
}

/** Shared by the exterior craft and its cameras, including the steering lean. */
export function vehiclePose(
  frame: Frame3,
  body: VehicleBody,
  courseId: CourseId,
  steer: number,
  kick: number,
  time: number,
): Frame3 {
  const lean = courseId === 'classic' ? steer * 0.75 + kick * 0.0015 : steer;
  const yaw = courseId === 'classic' ? lean * 0.025 : 0;
  const roll = lean * (courseId === 'classic' ? 0.07 : 0.09);
  const forward = add(scale(frame.forward, Math.cos(yaw)), scale(frame.right, Math.sin(yaw)));
  const lateral = add(scale(frame.right, Math.cos(yaw)), scale(frame.forward, -Math.sin(yaw)));
  const right = add(scale(lateral, Math.cos(roll)), scale(frame.up, Math.sin(roll)));
  const hover = body.hover + (courseId === 'classic' ? Math.sin(time * 24) * 0.55 : 0);
  return { ...frame, ...offset(frame, 0, hover), forward, right, up: cross(forward, right) };
}

export function mountCamera(
  pose: Frame3,
  body: VehicleBody,
  mount: Vec3,
  yaw: number,
  fov: number,
): ViewCamera {
  return {
    eye: offset(pose, mount.x * body.scale.x, mount.z * body.scale.z, mount.y * body.scale.y),
    forward: add(scale(pose.forward, Math.cos(yaw)), scale(pose.right, Math.sin(yaw))),
    right: add(scale(pose.right, Math.cos(yaw)), scale(pose.forward, -Math.sin(yaw))),
    up: { ...pose.up },
    fov,
  };
}

/** Preserve enough horizontal vision on portrait screens without moving the pilot's eye. */
export const pilotFov = (aspect: number): number =>
  2 * Math.atan(Math.tan(1.05 / 2) * Math.max(1, 0.9 / aspect));

export function playerVehiclePose(model: VehicleModel = vehicle.model): Frame3 {
  return vehiclePose(
    sampleCourse(player.s, player.x),
    model[course.id],
    course.id,
    player.steer,
    player.kickV,
    game.worldTime,
  );
}

export function pilotCamera(aspect: number): ViewCamera {
  const body = vehicle.model[course.id];
  return mountCamera(
    playerVehiclePose(),
    body,
    body.pilotEye,
    drivingView.lookYaw,
    pilotFov(aspect),
  );
}

export function updateLook(dt: number, reducedMotion: boolean): void {
  const enabled = insideView() && game.mode !== 'paused' && game.mode !== 'results';
  const left = enabled && (held.has('KeyQ') || touch.lookLeft);
  const right = enabled && (held.has('KeyE') || touch.lookRight);
  const target = ((right ? 1 : 0) - (left ? 1 : 0)) * (Math.PI * 0.46);
  drivingView.lookYaw = reducedMotion
    ? target
    : drivingView.lookYaw + (target - drivingView.lookYaw) * (1 - Math.exp(-dt * 14));
  if (Math.abs(drivingView.lookYaw - target) < 0.001) drivingView.lookYaw = target;
}

// A stable object makes the last rendered eye inspectable without solving or mutating in diagnostics.
export const pilotView: ViewCamera = {
  eye: vec(),
  forward: vec(1),
  right: vec(0, 1),
  up: vec(0, 0, 1),
  fov: 1.05,
};
