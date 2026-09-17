/**
 * Read-only diagnostics surface.
 *
 * Exposed as `window.EZero` so the build can be verified from the outside -
 * end-to-end tests and the original-vs-refactor parity harness both drive the
 * game through this. It reads live state and never mutates anything, so it
 * cannot change how the game plays.
 */
import { BOOST_RATIO, COURSE_SCALE, FIELD_SIZE, KMH, RACE_LAPS, TAU } from './config/constants';
import { reducedMotion } from './core/env';
import type { LoopHandle } from './core/loop';
import { clamp, mod } from './core/math';
import { sound } from './audio/sound';
import { surface } from './render/surface';
import { rivals } from './sim/rivals';
import { boostFX, game, player } from './sim/state';
import { BASE, MAX, RACE_DISTANCE, widthAt } from './track/layout';
import { sample, total } from './track/spline';
import { viewport } from './ui/viewport';

function createApi(loop: LoopHandle) {
  return Object.freeze({
    get state() {
      return game.mode;
    },

    get stats() {
      return {
        time: game.raceTime,
        freeLapTime: game.freeLapTime,
        progress: player.s / total,
        raceProgress: clamp(player.s / RACE_DISTANCE, 0, 1),
        fieldSize: FIELD_SIZE,
        rivalCount: rivals.length,
        totalLaps: RACE_LAPS,
        lapTimes: game.lapTimes.slice(),
        lapTime: Math.max(0, game.raceTime - game.lapStartTime),
        power: player.power,
        speed: (player.v / BASE) * KMH,
        position: game.displayPosition,
        lateral: player.x,
        lateralVelocity: player.latV,
        bounceVelocity: player.kickV,
        bounceTime: player.bounceTime,
        railHits: player.railHits,
        curve: sample(player.s).curve,
        halfWidth: widthAt(player.s),
        baseSpeed: BASE,
        legacyBaseSpeed: BASE / COURSE_SCALE,
        worldSpeed: player.v,
        speedMultiplier: COURSE_SCALE,
        boosting: player.boosting,
        boostRatio: BOOST_RATIO,
        boostTopSpeed: (MAX / BASE) * KMH,
        boostFX: boostFX.amount,
        boostBurst: boostFX.burst,
        boostParticles: boostFX.particles.length,
        reducedMotion,
        fps: loop.fps,
        trackLength: total,
        lap:
          game.lapResult && !game.lapResult.failed && game.mode !== 'free'
            ? RACE_LAPS
            : Math.min(
                game.mode === 'free' ? Infinity : RACE_LAPS,
                Math.floor(player.s / total) + 1,
              ),
        autoPilot: game.mode === 'victory',
        cameraYaw: mod(game.cameraYaw, TAU),
        cameraBlend: game.cameraBlend,
        finishAge: game.finishAge,
      };
    },

    get field() {
      return rivals.map((r) => ({
        id: r.id,
        s: r.s,
        x: r.x,
        v: r.v,
        pace: r.pace,
        color: r.color,
        finishedAt: r.finishedAt,
      }));
    },

    get viewport() {
      return {
        ...viewport,
        renderWidth: surface.w,
        renderHeight: surface.h,
        viewUnit: surface.viewUnit,
        canvasAspect: surface.w / surface.h,
      };
    },

    get audio() {
      const music = sound.musicElement;
      // Music is an optional drop-in file, so report what actually loaded
      // rather than a hardcoded title. See docs/AUDIO.md.
      const source = music.currentSrc || music.getAttribute('src') || '';
      return {
        enabled: sound.enabled,
        track: source ? decodeURIComponent(source.split('/').pop() ?? '') : null,
        available: music.readyState > 0,
        playing: !music.paused,
        currentTime: music.currentTime,
        duration: Number.isFinite(music.duration) ? music.duration : null,
        loop: music.loop,
        readyState: music.readyState,
        contextState: sound.context?.state || 'unavailable',
        musicGain: sound.musicGainValue,
        error: sound.musicError,
      };
    },

    get result() {
      return game.lapResult ? { ...game.lapResult } : null;
    },
  });
}

/** Shape of `window.EZero`, inferred from the object above. */
export type EZeroApi = ReturnType<typeof createApi>;

declare global {
  interface Window {
    EZero: EZeroApi;
  }
}

export function installDiagnostics(loop: LoopHandle): void {
  Object.defineProperty(window, 'EZero', { value: createApi(loop) });
}
