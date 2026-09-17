/**
 * Boost feel: the ramp, the ignition burst and the thruster particle trail.
 *
 * `amount` is the smoothed 0..1 intensity that drives the screen wash, camera
 * pull and audio. `burst` is a one-shot that fires on ignition and is gated by a
 * cooldown, so tapping boost cannot retrigger the flash every step.
 */
import { reducedMotion } from '../core/env';
import { lerp } from '../core/math';
import { random } from '../core/rng';
import { sound } from '../audio/sound';
import { project } from '../render/project';
import { sample } from '../track/spline';
import { boostFX, game, player } from './state';

/** Minimum time between ignition bursts. */
const BURST_COOLDOWN = 0.9;
/** Seconds between particle emissions. */
const EMIT_INTERVAL = 0.022;
/** Hard cap on live particles. */
const MAX_PARTICLES = 64;

/** Resets the effect state. DOM classes are cleared separately by the flow layer. */
export function resetBoostFX(): void {
  boostFX.amount = 0;
  boostFX.burst = 0;
  boostFX.cooldown = 0;
  boostFX.age = 0;
  boostFX.emit = 0;
  boostFX.active = false;
  boostFX.particles.length = 0;
}

export function updateBoostFX(dt: number): void {
  const active = player.boosting && (game.mode === 'race' || game.mode === 'free');

  boostFX.cooldown = Math.max(0, boostFX.cooldown - dt);
  boostFX.burst = Math.max(0, boostFX.burst - dt / 0.62);

  if (active && !boostFX.active) {
    boostFX.age = 0;
    if (boostFX.cooldown === 0) {
      boostFX.burst = 1;
      boostFX.cooldown = BURST_COOLDOWN;
      sound.boost();
    }
  }
  boostFX.active = active;
  boostFX.age += dt;

  // Fast attack, slower release.
  boostFX.amount = lerp(boostFX.amount, active ? 1 : 0, 1 - Math.exp(-dt * (active ? 13 : 5.2)));
  if (boostFX.amount < 0.001) boostFX.amount = 0;

  const particles = boostFX.particles;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    // Previous position is kept so the trail can be drawn as a streak.
    p.px = p.x;
    p.py = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // No trail during the finish orbit: the particles live in screen space.
  if (active && !reducedMotion && game.cameraBlend < 0.15) {
    boostFX.emit += dt;
    if (boostFX.emit >= EMIT_INTERVAL) {
      boostFX.emit = 0;
      const p = sample(player.s, player.x);
      const pr = project(p.x, p.y, 4);
      if (pr) {
        for (const side of [-1, 1]) {
          if (particles.length >= MAX_PARTICLES) break;
          const x = pr.x + side * 8.1 * pr.scale;
          const y = pr.y + 9;
          particles.push({
            x,
            y,
            px: x,
            py: y,
            vx: side * (28 + random() * 42) - player.steer * 42,
            vy: 150 + random() * 225,
            life: 0.16 + random() * 0.2,
            color: random() > 0.28 ? '#affbff' : '#ec96ff',
          });
        }
      }
    }
  } else {
    boostFX.emit = 0;
  }
}
