/**
 * One fixed simulation step.
 *
 * Dispatches by mode, then advances the things that run in every mode: decay
 * timers, sparks, the finish camera blend and the HUD tick.
 */
import { TAU } from '../config/constants';
import { reducedMotion } from '../core/env';
import { angleDiff, lerp, smooth } from '../core/math';
import { sound } from '../audio/sound';
import { showResult, syncModeUI } from '../game/flow';
import { BASE } from '../track/layout';
import { el } from '../ui/dom';
import { hideMessage, showMessage, updateHUD } from '../ui/hud';
import { updateBoostFX } from './boost';
import { updateAutoPilot, updateRace } from './physics';
import { game, player, sparkParticles } from './state';
import { fieldSize, updateRemoteCraft } from '../online/state';

/** HUD refresh interval. 25 Hz is smooth enough for numbers. */
const HUD_INTERVAL = 0.04;
/** Seconds for one full finish-camera orbit. Slower under reduced motion. */
const ORBIT_TIME = reducedMotion ? 12 : 7.2;
/** Gravity on collision sparks, in screen pixels per second squared. */
const SPARK_GRAVITY = 340;

export function update(dt: number): void {
  updateRemoteCraft(dt);
  // Paused still ticks audio so the engine fades out rather than cutting.
  if (game.mode === 'paused') {
    sound.update();
    return;
  }

  game.worldTime += dt;
  game.shake *= Math.exp(-dt * 8);
  game.damage *= Math.exp(-dt * 9);
  game.messageTime = Math.max(0, game.messageTime - dt);
  if (game.messageTime === 0) hideMessage();

  for (let i = sparkParticles.length - 1; i >= 0; i--) {
    const p = sparkParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += SPARK_GRAVITY * dt;
    p.life -= dt;
    if (p.life <= 0) sparkParticles.splice(i, 1);
  }

  if (game.mode === 'title') {
    game.demoS += BASE * 0.9 * dt;
  } else if (game.mode === 'countdown') {
    game.countTime -= dt;
    const num = Math.min(3, Math.ceil(game.countTime));
    if (num !== game.lastCount && num > 0) {
      game.lastCount = num;
      el.countdown.textContent = String(num).padStart(2, '0');
      sound.tone(num === 1 ? 660 : 440, 0.14, 0.15, 'square');
    }
    if (game.countTime <= 0) {
      game.mode = 'race';
      el.countdown.textContent = 'GO';
      sound.tone(880, 0.28, 0.18, 'square');
      showMessage(fieldSize() + ' RACERS · 3 LAPS', 1.5);
      syncModeUI();
    }
  } else if (game.mode === 'race') {
    if (game.raceTime > 0.55) el.countdown.classList.remove('show');
    updateRace(dt);
  } else if (game.mode === 'free') {
    updateRace(dt, true);
  } else if (game.mode === 'victory') {
    updateAutoPilot(dt);
  } else if (game.mode === 'finishing') {
    // Coast to a stop before the results overlay appears.
    game.finishDelay -= dt;
    player.v *= Math.exp(-dt * 3.5);
    player.s += player.v * dt;
    if (game.finishDelay <= 0) showResult();
  }

  const cinematic = game.mode === 'victory';
  game.cameraBlend = lerp(
    game.cameraBlend,
    cinematic ? 1 : 0,
    1 - Math.exp(-dt * (cinematic ? 2.3 : 6.5)),
  );

  // One full orbit, then a slow drift around a low side view.
  const orbit =
    (TAU + Math.PI / 2) * smooth(game.cinemaAge / ORBIT_TIME) +
    (game.cinemaAge > ORBIT_TIME ? Math.sin((game.cinemaAge - ORBIT_TIME) * 0.45) * 0.1 : 0);
  const targetYaw = cinematic ? orbit : 0;
  game.cameraYaw +=
    angleDiff(targetYaw, game.cameraYaw) * (1 - Math.exp(-dt * (cinematic ? 7 : 7.5)));

  updateBoostFX(dt);
  sound.update();

  game.hudTick += dt;
  if (game.hudTick > HUD_INTERVAL) {
    game.hudTick = 0;
    updateHUD();
  }
}
