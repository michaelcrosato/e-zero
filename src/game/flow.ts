/**
 * Mode transitions.
 *
 * Every screen change goes through here so the DOM, the audio and the
 * simulation can never disagree about what mode the game is in. `syncModeUI` is
 * the single place that maps the current mode onto overlay visibility.
 */
import { FIELD_SIZE, RACE_LAPS } from '../config/constants';
import { formatTime } from '../core/time';
import { sound } from '../audio/sound';
import { resetBoostFX } from '../sim/boost';
import { livePosition, resetRivals, rivals } from '../sim/rivals';
import { createPlayer, game, held, player, setBest, sparkParticles } from '../sim/state';
import { PAUSABLE_MODES } from '../sim/types';
import { total } from '../track/spline';
import { announce } from '../ui/announce';
import { boostTouchButton, el } from '../ui/dom';
import { hideMessage, refreshBest, showMessage, updateHUD } from '../ui/hud';
import { clearTouch } from '../ui/touch';

/** Countdown duration, chosen so "03" is readable before it ticks. */
const COUNTDOWN = 2.6;
/** Delay between running out of power and the results overlay. */
const FAILURE_DELAY = 0.65;

/** Resets the boost effect state and every DOM class it drives. */
export function clearBoostFX(): void {
  resetBoostFX();
  el.stage.classList.remove('hyper');
  el.boostCallout.classList.remove('show');
  boostTouchButton?.classList.remove('firing');
}

export function syncModeUI(): void {
  el.app.dataset.mode = game.mode;
  sound.syncMusic();
  const cinematic =
    game.mode === 'victory' || (game.mode === 'paused' && game.pausedMode === 'victory');
  el.stage.classList.toggle('cinematic', cinematic);
  el.finishDock.classList.toggle('hidden', game.mode !== 'victory');
  el.cinemaTag.classList.toggle('hidden', game.mode !== 'victory');
  el.freeControls.classList.toggle('hidden', game.mode !== 'free');
  el.pauseButton.style.display = PAUSABLE_MODES.includes(game.mode) ? 'block' : 'none';
}

export function resetPlayer(): void {
  clearBoostFX();
  Object.assign(player, createPlayer());
  resetRivals();

  game.fieldTime = 0;
  game.trafficClock = 0;
  game.lapTimes = [];
  game.lapStartTime = 0;
  game.placesNotice = FIELD_SIZE;
  game.raceTime = 0;
  game.freeLapTime = 0;
  game.lastFreeTime = 0;
  game.cinemaAge = 0;
  game.cameraBlend = 0;
  game.cameraYaw = 0;
  game.finishAge = 0;
  game.padLock = [0, 0];
  game.displayPosition = FIELD_SIZE;
  game.lastPass = FIELD_SIZE;
  game.damage = 0;
  game.shake = 0;
  game.messageTime = 0;
  game.messageText = '';
  game.lapResult = null;

  hideMessage();
  sparkParticles.length = 0;
  held.clear();
  clearTouch();
}

export function startRace(): void {
  sound.init();
  resetPlayer();
  game.mode = 'countdown';
  game.countTime = COUNTDOWN;
  game.lastCount = -1;
  sound.startMusic();

  el.titleOverlay.classList.add('hidden');
  el.resultOverlay.classList.add('hidden');
  el.pauseOverlay.classList.add('hidden');
  el.hud.classList.remove('hidden');

  el.countdown.textContent = '03';
  el.driveHint.style.opacity = '1';
  el.driveHint.textContent = matchMedia('(pointer:coarse)').matches
    ? 'STEER WITH THE ARROWS · HOLD BOOST'
    : 'STEER ← → / HOLD SPACE TO BOOST';
  el.countdown.classList.add('show');

  syncModeUI();
  sound.setVolume();
  updateHUD();
  announce(
    'Three-lap race. You start in position 100 of 100. Steer with the arrow keys. Hold Space to boost.',
  );
}

export function returnToTitle(): void {
  clearBoostFX();
  game.demoS = player.s || total * 0.085;
  game.mode = 'title';
  held.clear();
  clearTouch();
  game.cameraYaw = 0;
  game.cameraBlend = 0;
  player.boosting = false;
  game.shake = 0;
  game.damage = 0;

  el.resultOverlay.classList.add('hidden');
  el.pauseOverlay.classList.add('hidden');
  el.hud.classList.add('hidden');
  el.titleOverlay.classList.remove('hidden');
  el.countdown.classList.remove('show');
  hideMessage();

  syncModeUI();
  sound.setVolume();
  el.startButton.focus({ preventScroll: true });
}

/** Toggles pause. Safe to call in any mode. */
export function pauseRace(): void {
  if (PAUSABLE_MODES.includes(game.mode)) {
    game.pausedMode = game.mode;
    game.mode = 'paused';
    held.clear();
    clearTouch();
    el.pauseOverlay.classList.remove('hidden');
    sound.setVolume();
    syncModeUI();
    announce('Race paused.');
  } else if (game.mode === 'paused') {
    game.mode = game.pausedMode;
    el.pauseOverlay.classList.add('hidden');
    sound.setVolume();
    sound.init();
    syncModeUI();
  }
}

/** Takes back manual control after finishing. */
export function continueDriving(): void {
  if (game.mode !== 'victory') return;
  game.mode = 'free';
  player.boosting = false;
  held.clear();
  clearTouch();
  el.countdown.classList.remove('show');
  game.messageTime = 0;
  hideMessage();
  syncModeUI();
  el.driveHint.textContent = 'FREE DRIVE · C AUTO PILOT · X EXIT';
  el.driveHint.style.opacity = '1';
  showMessage('YOU HAVE CONTROL', 1.5);
  sound.init();
  sound.setVolume();
  announce('Free drive. You have control. Press C for auto pilot. Press X to exit.');
}

/** Hands control back to the auto pilot and the orbiting finish camera. */
export function watchAutoPilot(): void {
  if (game.mode !== 'free') return;
  game.mode = 'victory';
  game.cinemaAge = 0;
  player.boosting = false;
  player.pad = 0;
  held.clear();
  clearTouch();
  el.countdown.classList.remove('show');
  syncModeUI();
  announce('Auto pilot is on. Press Enter to drive. Press X to exit.');
}

export function finishRace(failed = false): void {
  if (game.mode !== 'race') return;
  player.boosting = false;
  player.pad = 0;

  // Finish order uses crossing times, not where a rival happens to be now.
  const position = failed
    ? livePosition()
    : 1 +
      rivals.filter((r) => r.finishedAt !== null && r.finishedAt <= game.raceTime + 1e-7).length;
  game.displayPosition = position;

  game.lapResult = {
    time: game.raceTime,
    position,
    top: Math.round(player.topSpeed),
    power: Math.round(Math.max(0, player.power)),
    failed,
    newBest: false,
    fieldSize: FIELD_SIZE,
    totalLaps: RACE_LAPS,
    laps: game.lapTimes.slice(),
    positionsGained: FIELD_SIZE - position,
  };

  if (!failed && (!game.best || game.raceTime < game.best)) {
    setBest(game.raceTime);
    game.lapResult.newBest = true;
    refreshBest();
  }

  game.finishAge = 0;
  game.cinemaAge = 0;
  hideMessage();
  game.messageTime = 0;
  el.countdown.textContent = failed ? 'POWER OUT' : position === 1 ? 'YOU WIN' : 'RACE COMPLETE';
  el.countdown.classList.add('show');

  if (failed) {
    game.mode = 'finishing';
    game.finishDelay = FAILURE_DELAY;
    sound.hit();
  } else {
    game.mode = 'victory';
    game.freeLapTime = Math.max(0, game.fieldTime - game.raceTime);
    player.kickV = 0;
    player.bounceTime = 0;
    el.dockPlace.textContent =
      position === 1
        ? 'FIRST / 100 RACERS'
        : 'FINISH / ' + String(position).padStart(3, '0') + ' OF 100';
    el.dockTime.textContent = formatTime(game.raceTime);
    el.dockNote.textContent =
      '3 LAPS · +' +
      (FIELD_SIZE - position) +
      ' PLACES' +
      (game.lapResult.newBest ? ' · NEW BEST' : ' · AUTO PILOT');
    sound.finish();
  }

  syncModeUI();
  updateHUD();
  announce(
    failed
      ? 'Power lost. Press Enter to race again.'
      : 'Three laps complete. Position ' +
          position +
          ' of ' +
          FIELD_SIZE +
          '. Press Enter to keep racing or X to exit.',
  );
}

/** Shown only after a power-out; a completed race goes to the finish dock. */
export function showResult(): void {
  game.mode = 'results';
  el.countdown.classList.remove('show');
  el.resultOverlay.classList.remove('hidden');
  el.resultEyebrow.textContent = 'POWER LOST · RACE OVER';
  el.resultTitle.textContent = 'POWER OUT.';
  el.resultTime.textContent = formatTime(game.lapResult?.time ?? 0);
  el.resultSpeed.textContent = String(game.lapResult?.top ?? 0);
  el.resultPower.textContent = (game.lapResult?.power ?? 0) + '%';
  el.recordTag.textContent = 'USE LESS BOOST. AVOID THE RAILS.';
  syncModeUI();
  sound.setVolume();
}
