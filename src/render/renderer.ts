/**
 * Frame assembly.
 *
 * Solves the camera, draws the scene back to front into the offscreen surface,
 * then blits it to the visible canvas with screen shake and boost vibration
 * applied. A small overscan on the blit hides the dark edges the shake exposes.
 */
import { SKY_H } from '../config/constants';
import { reducedMotion } from '../core/env';
import { clamp, lerp, smooth } from '../core/math';
import { boostFX, camera, game, player, sparkParticles } from '../sim/state';
import { BASE } from '../track/layout';
import { sample } from '../track/spline';
import { viewport } from '../ui/viewport';
import { drawBoostFX } from './boostfx';
import { drawGround } from './ground';
import { drawObjects } from './props';
import { drawSky } from './sky';
import { drawSpeed } from './speedlines';
import { surface } from './surface';
import { course } from '../track/course';
import { drawSpatial } from './spatial-renderer';
import { drivingView, insideView, pilotCamera, pilotView } from './driving-view';
import { drawCockpit } from './cockpit';

/** Seconds for the finish camera to complete its orbit. */
const ORBIT_TIME = 7.2;

function solveCamera(demo: boolean): void {
  const { h: H, viewUnit } = surface;
  if (!demo && insideView()) {
    Object.assign(pilotView, pilotCamera(surface.w / H));
    camera.x = pilotView.eye.x;
    camera.y = pilotView.eye.y;
    camera.height = pilotView.eye.z;
    camera.angle = Math.atan2(pilotView.forward.y, pilotView.forward.x);
    camera.focal = H / (2 * Math.tan(pilotView.fov / 2));
    camera.horizon = Math.round(H / 2);
    return;
  }

  const s = demo ? game.demoS : player.s;
  const p = sample(s);
  const lateral = demo ? Math.sin(game.worldTime * 0.6) * 16 : player.x;
  const ratio = demo ? 0.9 : player.v / BASE;

  const blend = demo ? 0 : game.cameraBlend;
  const yaw = demo ? 0 : game.cameraYaw;
  const hyper = demo || reducedMotion ? 0 : boostFX.amount;
  const kick = demo || reducedMotion ? 0 : boostFX.burst;

  camera.angle = p.angle + yaw + (demo ? 0 : player.steer * 0.014 * (1 - blend));

  // Tall windows pull the camera in behind the craft so the HUD has room.
  const tall = smooth((1.39 - viewport.aspect) / 0.84);
  const follow = lerp(0.59, 0.78, tall);

  const focus = sample(s, lateral * lerp(follow, 1, blend));
  const distance = lerp(92 + hyper * 8 + kick * 2, 142, blend);
  camera.x = focus.x - Math.cos(camera.angle) * distance;
  camera.y = focus.y - Math.sin(camera.angle) * distance;

  const raceHeight =
    59 +
    hyper * 12 -
    Math.max(0, ratio - 1) * 3 +
    (reducedMotion ? 0 : Math.sin(game.worldTime * 39) * ratio * 0.12);
  const orbitHeight = 29 + 18 * (1 - smooth(game.cinemaAge / ORBIT_TIME));
  camera.height = lerp(raceHeight, orbitHeight, blend);

  // Boost narrows the field of view, which reads as acceleration.
  camera.focal =
    lerp(334 - Math.max(0, ratio - 1) * 26 - hyper * 10 - kick * 9, 378, blend) * viewUnit;

  const baseHorizon = lerp(SKY_H + hyper * 5, 166, blend) * viewUnit;
  const extraHeight = Math.max(0, H - 432 * viewUnit);
  camera.horizon = Math.round(
    clamp(baseHorizon + extraHeight * lerp(0.57, 0.48, blend), 12, H - 30),
  );
  // Leave extra space for the finish controls on a tall touch screen.
  if (tall > 0 && blend > 0) camera.horizon -= Math.round(tall * blend * H * 0.025);
}

export function render(): void {
  const demo = game.mode === 'title';
  solveCamera(demo);

  const { ctx, out, scene, w: W, h: H } = surface;
  const blend = demo ? 0 : game.cameraBlend;
  const hyper = demo || reducedMotion ? 0 : boostFX.amount;
  const kick = demo || reducedMotion ? 0 : boostFX.burst;

  if (course.id === 'skyline') drawSpatial(demo);
  else {
    drawSky();
    drawGround();
    drawObjects(demo);
  }
  // External thruster rings and screen-space streaks do not belong inside the canopy.
  if (!insideView()) {
    drawSpeed();
    drawBoostFX(demo);
  }

  for (const p of sparkParticles) {
    ctx.globalAlpha = clamp(p.life / 0.18, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x | 0, p.y | 0, 3, 2);
  }
  ctx.globalAlpha = 1;
  if (insideView() && drivingView.mode === 'cockpit') drawCockpit();

  // Impact shake is random; boost vibration is a steady high-frequency hum.
  const vibration = insideView() ? 0 : (hyper * 0.6 + kick * 1.6) * (1 - blend);
  const sx =
    (game.shake && !insideView() ? (Math.random() - 0.5) * game.shake * 2 : 0) +
    Math.sin(game.worldTime * 93) * vibration;
  const sy =
    (game.shake && !insideView() ? (Math.random() - 0.5) * game.shake : 0) +
    Math.cos(game.worldTime * 117) * vibration * 0.6;

  out.fillStyle = '#080c17';
  out.fillRect(0, 0, W, H);
  out.drawImage(scene, (sx | 0) - 2, (sy | 0) - 2, W + 4, H + 4);
}
