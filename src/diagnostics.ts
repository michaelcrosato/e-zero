/**
 * Read-only diagnostics surface.
 *
 * Exposed as `window.EZero` so the build can be verified from the outside -
 * end-to-end tests and the original-vs-refactor parity harness both drive the
 * game through this. It reads live state and never mutates anything, so it
 * cannot change how the game plays.
 */
import { BOOST_RATIO, COURSE_SCALE, KMH, RACE_LAPS, TAU } from './config/constants';
import { reducedMotion } from './core/env';
import type { LoopHandle } from './core/loop';
import { clamp, mod } from './core/math';
import { sound } from './audio/sound';
import { surface } from './render/surface';
import { rivals } from './sim/rivals';
import { boostFX, game, player } from './sim/state';
import { BASE } from './track/layout';
import {
  course,
  sampleCourse as sample,
  lateralDrift,
  gradeAcceleration,
  courseWidthAt as widthAt,
  courseLength,
  raceDistance,
  courseBaseSpeed,
  courseMaxSpeed,
  courseSpeedMultiplier,
} from './track/course';
import { skylineLaneCountAt, MERGE_START, MERGE_END } from './track/launch';
import { sectionAt, skyline } from './track/spatial';
import { spatialView } from './render/spatial-renderer';
import { viewport } from './ui/viewport';
import { fieldSize, online, remoteCraft } from './online/state';
import { vehicle } from './config/vehicles';
import { drivingView, insideView, pilotView, playerVehiclePose } from './render/driving-view';
import { cameraFeeds } from './render/camera-feeds';

function createApi(loop: LoopHandle) {
  return Object.freeze({
    get state() {
      return game.mode;
    },

    get stats() {
      const total = courseLength();
      const RACE_DISTANCE = raceDistance();
      const frame = sample(player.s, player.x);
      return {
        course: course.id,
        elevation: frame.z,
        forward: { ...frame.forward },
        up: { ...frame.up },
        right: { ...frame.right },
        bank: frame.bank,
        lateralDrift: lateralDrift(frame, player.v),
        gradeAcceleration: course.id === 'skyline' ? gradeAcceleration(frame) : 0,
        section: course.id === 'skyline' ? sectionAt(player.s).name : 'Neon Harbor',
        sectionIndex: course.id === 'skyline' ? sectionAt(player.s).index : 1,
        time: game.raceTime,
        freeLapTime: game.freeLapTime,
        progress: player.s / total,
        raceProgress: clamp(player.s / RACE_DISTANCE, 0, 1),
        fieldSize: fieldSize(),
        rivalCount: online.racing ? remoteCraft.length : rivals.length,
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
        lanes: course.id === 'skyline' ? skylineLaneCountAt(player.s) : 3,
        baseSpeed: courseBaseSpeed(),
        legacyBaseSpeed: BASE / COURSE_SCALE,
        worldSpeed: player.v,
        speedMultiplier: COURSE_SCALE * courseSpeedMultiplier(),
        boosting: player.boosting,
        boostRatio: BOOST_RATIO,
        boostTopSpeed: (courseMaxSpeed() / BASE) * KMH,
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
        halfWidth: widthAt(r.s),
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

    get view() {
      const pose = playerVehiclePose();
      return {
        mode: drivingView.mode,
        inside: insideView(),
        vehicle: vehicle.model.id,
        mount: { ...vehicle.model[course.id].pilotEye },
        scale: { ...vehicle.model[course.id].scale },
        lookYaw: drivingView.lookYaw,
        steer: player.steer,
        eye: { ...pilotView.eye },
        forward: { ...pilotView.forward },
        right: { ...pilotView.right },
        up: { ...pilotView.up },
        fov: pilotView.fov,
        vehiclePose: {
          ...pose,
          forward: { ...pose.forward },
          right: { ...pose.right },
          up: { ...pose.up },
        },
        feeds: {
          frame: cameraFeeds.frame,
          time: cameraFeeds.time,
          rearCraft: cameraFeeds.rear.drawnCraft,
          leftCraft: cameraFeeds.left.drawnCraft,
          rightCraft: cameraFeeds.right.drawnCraft,
        },
        contacts: cameraFeeds.contacts.map((contact) => ({ ...contact })),
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

    get course() {
      return {
        id: course.id,
        graphicsReady: spatialView.ready,
        graphicsLost: spatialView.lost,
        camera: {
          forward: { ...spatialView.forward },
          up: { ...spatialView.up },
          right: { ...spatialView.right },
          eye: { ...spatialView.eye },
        },
        drawnCraft: spatialView.drawnCraft,
        sections: skyline.sections.map((part) => ({ ...part })),
        launch: { mergeStart: MERGE_START, mergeEnd: MERGE_END },
      };
    },

    get online() {
      return {
        active: online.active,
        racing: online.racing,
        phase: online.phase,
        code: online.code,
        id: online.id,
        host: online.host,
        round: online.round,
        racers: online.racers.map((r) => ({ ...r })),
        craft: remoteCraft.map((r) => ({ ...r })),
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
