/**
 * Keyboard and touch input.
 *
 * Steering is read as a latched key set rather than from events, so holding two
 * keys resolves predictably and a dropped keyup cannot leave the craft turning.
 */
import { continueDriving, pauseRace, returnToTitle, startRace, watchAutoPilot } from '../game/flow';
import { sound } from '../audio/sound';
import { game, held, touch } from '../sim/state';
import { ACTIVE_MODES, PAUSABLE_MODES } from '../sim/types';
import { el, touchButtons } from './dom';
import { clearTouch } from './touch';

export interface InputState {
  /** -1 left, 0 straight, 1 right. */
  steer: number;
  boost: boolean;
  brake: boolean;
}

/** Keys the game consumes. Anything else keeps its browser behaviour. */
const GAME_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'Escape',
  'KeyP',
  'KeyR',
  'KeyM',
  'KeyC',
  'KeyX',
  'Enter',
]);

/** Keys that mean "I want to drive", used to take over from the auto pilot. */
const DRIVE_KEYS = new Set([
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyA',
  'KeyD',
  'ArrowDown',
  'KeyS',
]);

/** Buttons whose Enter press should start the race rather than re-click. */
const START_BUTTONS = [
  'startButton',
  'retryButton',
  'restartPause',
  'resumeButton',
  'continueButton',
];

export function getInput(): InputState {
  const right = held.has('ArrowRight') || held.has('KeyD') || touch.right;
  const left = held.has('ArrowLeft') || held.has('KeyA') || touch.left;
  return {
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    boost: held.has('Space') || held.has('ShiftLeft') || held.has('ShiftRight') || touch.boost,
    brake: held.has('ArrowDown') || held.has('KeyS') || touch.brake,
  };
}

/** Browsers block autoplay until a gesture; retry once the player makes one. */
function retryMusicOnGesture(): void {
  if (sound.musicBlocked && ACTIVE_MODES.includes(game.mode)) {
    sound.init();
    sound.syncMusic();
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (!GAME_KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;

  // A focused button keeps its normal Enter action.
  const active = document.activeElement as HTMLElement | null;
  if (active?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (!el.onlineOverlay.classList.contains('hidden')) return;
  if (
    e.code === 'Enter' &&
    active?.tagName === 'BUTTON' &&
    getComputedStyle(active).visibility !== 'hidden' &&
    !START_BUTTONS.includes(active.id)
  )
    return;

  e.preventDefault();

  if (e.repeat) {
    if (DRIVE_KEYS.has(e.code) && game.mode !== 'victory') held.add(e.code);
    return;
  }

  if (e.code === 'KeyM') return sound.toggle();
  if (e.code === 'KeyX' && ['victory', 'free', 'paused', 'results'].includes(game.mode))
    return returnToTitle();
  if (e.code === 'KeyC') {
    if (game.mode === 'free') watchAutoPilot();
    else if (game.mode === 'victory') continueDriving();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') return pauseRace();
  if (e.code === 'KeyR' && game.mode !== 'title') return startRace();
  if (
    (e.code === 'Enter' || e.code === 'Space') &&
    (game.mode === 'title' || game.mode === 'results')
  )
    return startRace();
  if (e.code === 'Enter' && game.mode === 'paused') return pauseRace();

  if (
    game.mode === 'victory' &&
    (e.code === 'Enter' || (DRIVE_KEYS.has(e.code) && game.finishAge > 0.7))
  ) {
    continueDriving();
    if (DRIVE_KEYS.has(e.code)) held.add(e.code);
    return;
  }

  held.add(e.code);
}

/** Wires every input source. Call once at startup. */
export function bindInput(): void {
  el.startButton.addEventListener('click', startRace);
  el.retryButton.addEventListener('click', startRace);
  el.restartPause.addEventListener('click', startRace);
  el.resumeButton.addEventListener('click', pauseRace);
  el.pauseButton.addEventListener('click', pauseRace);
  el.menuButton.addEventListener('click', returnToTitle);
  el.quitPause.addEventListener('click', returnToTitle);
  el.continueButton.addEventListener('click', continueDriving);
  el.exitButton.addEventListener('click', returnToTitle);
  el.freeExitButton.addEventListener('click', returnToTitle);
  el.autoButton.addEventListener('click', watchAutoPilot);
  el.soundButton.addEventListener('click', () => sound.toggle());

  window.addEventListener('pointerdown', retryMusicOnGesture, { capture: true, passive: true });
  window.addEventListener('keydown', retryMusicOnGesture, { capture: true });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', (e) => held.delete(e.code));

  // Losing focus or being hidden must not leave the craft under power.
  window.addEventListener('blur', () => {
    held.clear();
    clearTouch();
    if (PAUSABLE_MODES.includes(game.mode)) pauseRace();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && PAUSABLE_MODES.includes(game.mode)) pauseRace();
  });

  for (const b of touchButtons) {
    const control = b.dataset.control as keyof typeof touch | undefined;
    if (!control) continue;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      sound.init();
      if (game.mode === 'victory' && game.finishAge > 0.7) continueDriving();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is a nicety; the release handlers still fire without it.
      }
      touch[control] = true;
      b.classList.add('active');
    });
    const release = (e: Event): void => {
      e.preventDefault();
      touch[control] = false;
      b.classList.remove('active');
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
