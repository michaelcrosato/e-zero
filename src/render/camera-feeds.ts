import { vehicle } from '../config/vehicles';
import { online, remoteCraft } from '../online/state';
import { rivals } from '../sim/rivals';
import { camera, game, player } from '../sim/state';
import { course, courseLength } from '../track/course';
import { mountCamera, playerVehiclePose, type ViewCamera } from './driving-view';
import { drawGround } from './ground';
import { drawObjects } from './props';
import { drawSky } from './sky';
import { drawSpatialCamera, spatialView } from './spatial-renderer';
import { surface } from './surface';
import { senseTraffic, type TrafficContact } from './traffic';

export function displayCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('E-Zero: camera display needs a 2D canvas context.');
  return { canvas, ctx };
}

function feed(width: number, height: number) {
  const display = displayCanvas(width, height);
  const frame = display.ctx.createImageData(width, height);
  return { ...display, frame, pixels: new Uint32Array(frame.data.buffer), drawnCraft: 0 };
}

export const cameraFeeds = {
  rear: feed(256, 80),
  left: feed(160, 100),
  right: feed(160, 100),
  contacts: [] as TrafficContact[],
  frame: 0,
  time: -1,
  signature: '',
};

function captureClassic(target: ReturnType<typeof feed>, view: ViewCamera): void {
  const previousCamera = { ...camera };
  const previousSurface = {
    ctx: surface.ctx,
    w: surface.w,
    h: surface.h,
    viewUnit: surface.viewUnit,
    frame: surface.frame,
    pixels: surface.pixels,
  };
  const { width, height } = target.canvas;
  // Classic's rasterizer has one working surface. Restore every borrowed field even on failure;
  // the main camera, particles, viewport and read-only diagnostics must never observe a feed.
  try {
    Object.assign(surface, {
      ctx: target.ctx,
      w: width,
      h: height,
      viewUnit: height / 432,
      frame: target.frame,
      pixels: target.pixels,
    });
    Object.assign(camera, {
      x: view.eye.x,
      y: view.eye.y,
      height: view.eye.z,
      angle: Math.atan2(view.forward.y, view.forward.x),
      horizon: Math.round(height / 2),
      focal: height / (2 * Math.tan(view.fov / 2)),
    });
    drawSky();
    drawGround();
    drawObjects(false, true, true);
  } finally {
    Object.assign(camera, previousCamera);
    Object.assign(surface, previousSurface);
  }
}

/** Live views run at 15 Hz and at small fixed resolutions, never at full scene pixel cost. */
export function updateCameraFeeds(): void {
  const signature = `${course.id}/${vehicle.model.id}/${game.mode}/${spatialView.ready}/${surface.w}/${surface.h}`;
  if (signature === cameraFeeds.signature && game.worldTime - cameraFeeds.time < 1 / 15) return;
  const body = vehicle.model[course.id];
  const pose = playerVehiclePose();
  const feeds = [
    [cameraFeeds.rear, body.rearCamera, Math.PI, 0.65],
    [cameraFeeds.left, body.leftCamera, -Math.PI * 0.69, 1.3],
    [cameraFeeds.right, body.rightCamera, Math.PI * 0.69, 1.3],
  ] as const;
  for (const [target, mount, yaw, fov] of feeds) {
    const view = mountCamera(pose, body, mount, yaw, fov);
    if (course.id === 'skyline')
      target.drawnCraft = drawSpatialCamera(
        view,
        target.ctx,
        target.canvas.width,
        target.canvas.height,
      );
    else captureClassic(target, view);
  }
  cameraFeeds.contacts = senseTraffic(player, online.racing ? remoteCraft : rivals, courseLength());
  cameraFeeds.signature = signature;
  cameraFeeds.time = game.worldTime;
  cameraFeeds.frame++;
}
