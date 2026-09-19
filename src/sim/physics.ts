/**
 * Player physics, collisions and lap tracking.
 *
 * Runs at a fixed 120 Hz step. Speed, steering and lateral motion are all
 * exponential approaches (`1 - exp(-dt * k)`), which are stable at any step size
 * and give the craft its weight. Rail contact applies a `kickV` that steering
 * deliberately cannot cancel, so a bounce always costs you the line.
 */
import { KMH, RACE_LAPS } from '../config/constants';
import { fieldSize, online } from '../online/state';
import { reducedMotion } from '../core/env';
import { clamp, lerp, mod } from '../core/math';
import { formatTime } from '../core/time';
import { sound } from '../audio/sound';
import { project } from '../render/project';
import { surface } from '../render/surface';
import { BASE, MAX, RACE_DISTANCE, pads, repair, repairX, widthAt } from '../track/layout';
import { total } from '../track/spline';
import { course, sampleCourse as sample, gradeAcceleration, lateralDrift } from '../track/course';
import { projectSpatial } from '../render/spatial-renderer';
import { offset } from '../core/vector';
import { announce } from '../ui/announce';
import { showMessage } from '../ui/hud';
import { el } from '../ui/dom';
import { finishRace } from '../game/flow';
import { getInput } from '../ui/input';
import { livePosition, rivals, roadPosition, updateRivals } from './rivals';
import { game, player, sparkParticles } from './state';

/** Power below which boost cuts out until the button is released. */
const BOOST_CUTOFF = 15;
/** Power needed to re-arm boost after a cutout. */
const BOOST_REARM = 30;
/** Lateral clearance from the rail before contact registers. */
const RAIL_MARGIN = 22;

export function spawnSparks(x: number, y: number, count = 12): void {
  for (let i = 0; i < count; i++) {
    sparkParticles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 300,
      vy: -35 - Math.random() * 155,
      life: 0.24 + Math.random() * 0.28,
      max: 0.55,
      color: i % 3 ? '#ffe7a0' : '#fff9e9',
    });
  }
}

/** Rail contact. The impulse scales with speed and how hard you arrived. */
export function hitRail(side: number, limit: number): void {
  const approach = Math.abs(player.latV + player.kickV);
  const impulse = clamp(400 + (player.v / BASE) * 105 + approach * 0.28, 440, 660);

  player.x = side * (limit - 3);
  player.latV = -side * 65;
  player.kickV = -side * impulse;
  player.bounceTime = 0.36;
  player.railLock = 0.2;
  player.railHits++;
  player.v *= 0.9;
  player.power = Math.max(0, player.power - 6.5);
  player.impact = 0.25;

  game.shake = Math.max(game.shake, reducedMotion ? 0 : 5.5);
  game.damage = Math.max(game.damage, reducedMotion ? 0.09 : 0.19);
  sound.hit();

  const p = sample(player.s, player.x + side * 15);
  const pr = course.id === 'skyline' ? projectSpatial(offset(p, 0, 5)) : project(p.x, p.y, 5);
  const { w: W, h: H } = surface;
  spawnSparks(
    pr ? clamp(pr.x, 25, W - 25) : W / 2 + side * 190,
    pr ? clamp(pr.y, 140, H - 28) : H * 0.8,
    25,
  );
  showMessage('RAIL BOUNCE', 0.55);
}

/** Awards lap splits for every lap boundary crossed this step. */
function updateRaceLaps(oldS: number, dt: number): void {
  const before = Math.floor(oldS / total);
  const after = Math.floor(player.s / total);
  for (let lap = before + 1; lap <= Math.min(after, RACE_LAPS); lap++) {
    // Interpolate the crossing so splits are not quantised to the step.
    const fraction = clamp((lap * total - oldS) / Math.max(1e-8, player.s - oldS), 0, 1);
    const crossing = game.raceTime - dt + fraction * dt;
    game.lapTimes.push(crossing - game.lapStartTime);
    game.lapStartTime = crossing;

    if (lap < RACE_LAPS) {
      const next = lap + 1;
      showMessage(next === RACE_LAPS ? 'FINAL LAP · 03 / 03' : 'LAP 02 / 03', 2.1);
      announce(
        (next === RACE_LAPS ? 'Final lap.' : 'Lap ' + next + ' of ' + RACE_LAPS + '.') +
          ' Position ' +
          game.displayPosition +
          ' of ' +
          fieldSize() +
          '.',
      );
      sound.tone(next === RACE_LAPS ? 880 : 740, 0.18, 0.12, 'square');
    } else {
      game.raceTime = crossing;
      finishRace(false);
    }
  }
}

/** Lap timing for free drive, which has no lap limit. */
function updateFreeLap(oldS: number, dt: number): void {
  game.freeLapTime += dt;
  if (Math.floor(player.s / total) > Math.floor(oldS / total)) {
    const over = mod(player.s, total) / Math.max(1, player.v);
    game.lastFreeTime = Math.max(0, game.freeLapTime - over);
    game.freeLapTime = over;
    if (game.mode === 'free')
      showMessage(
        'LAP ' + Math.floor(player.s / total) + ' · ' + formatTime(game.lastFreeTime),
        1.8,
      );
  }
}

export function updateRace(dt: number, free = false): void {
  const input = getInput();
  const p = sample(player.s);
  const oldS = player.s;
  if (!free) game.raceTime += dt;

  player.impact = Math.max(0, player.impact - dt);
  player.pad = Math.max(0, player.pad - dt);
  player.railLock = Math.max(0, player.railLock - dt);
  player.bounceTime = Math.max(0, player.bounceTime - dt);
  game.padLock = game.padLock.map((t) => Math.max(0, t - dt));

  // Boost lockout: once power bottoms out you must release and let it recover.
  if (player.power <= BOOST_CUTOFF) player.boostLock = true;
  if (!input.boost || player.power >= BOOST_REARM) player.boostLock = false;
  const boost = input.boost && player.power > BOOST_CUTOFF && !player.boostLock && !input.brake;
  player.boosting = !input.brake && (boost || player.pad > 0);

  const target = input.brake ? BASE * 0.53 : player.boosting ? MAX : BASE;
  const acceleration = input.brake ? 7.0 : player.boosting ? 9.2 : target > player.v ? 4.2 : 2.55;
  player.v = lerp(player.v, target, 1 - Math.exp(-dt * acceleration));
  if (course.id === 'skyline')
    player.v = clamp(player.v + gradeAcceleration(p) * dt, 0, MAX * 1.12);
  player.power = clamp(player.power + (boost ? -14.5 : 3.3) * dt, 0, 100);

  player.steer = lerp(player.steer, input.steer, 1 - Math.exp(-dt * 12));
  // Cornering throws the craft outward, and harder the faster you go.
  const drift = lateralDrift(p, player.v);
  const authority = player.bounceTime > 0 ? 0.24 : 1;
  const wanted = input.steer * (225 + (player.v / BASE) * 78) * authority + drift;
  player.latV = lerp(player.latV, wanted, 1 - Math.exp(-dt * 10));
  player.x += (player.latV + player.kickV) * dt;
  player.kickV *= Math.exp(-dt * 3.9);
  player.s += player.v * dt;

  const limit = widthAt(player.s) - RAIL_MARGIN;
  if (Math.abs(player.x) > limit) {
    const side = Math.sign(player.x);
    if (player.railLock <= 0) hitRail(side, limit);
    else player.x = side * limit;
  }
  player.topSpeed = Math.max(player.topSpeed, (player.v / BASE) * KMH);

  // Wrapped distance checks work on every lap, including free drive.
  pads.forEach((pad, i) => {
    const ds = mod(player.s - pad.s + total / 2, total) - total / 2;
    if (Math.abs(ds) < pad.len / 2 && Math.abs(player.x - pad.x) < 29 && !game.padLock[i]) {
      player.pad = 1.1;
      game.padLock[i] = 2.5;
      if (!input.brake) {
        player.v = Math.min(MAX, Math.max(player.v + BASE * 0.28, BASE * 1.65));
        player.boosting = true;
      }
      showMessage('BOOST STRIP', 0.8);
      sound.pad();
    }
  });

  const lapS = mod(player.s, total);
  if (
    lapS > repair.s &&
    lapS < repair.s + repair.len &&
    Math.abs(player.x - repairX(player.s)) < repair.width / 2 + 7
  ) {
    player.power = Math.min(100, player.power + 49 * dt);
    if (game.messageText !== 'POWER UP' || game.messageTime < 0.2) showMessage('POWER UP', 0.4);
  }

  updateRivals(dt);

  for (const r of rivals) {
    if (online.racing) break;
    const ds = mod(r.s - player.s + total / 2, total) - total / 2;
    if (Math.abs(ds) < 34 && Math.abs(player.x - r.x) < 30 && player.impact === 0) {
      const side = player.x < r.x ? -1 : 1;
      player.x += side * 7;
      player.kickV += side * 150;
      player.v *= 0.965;
      player.power = Math.max(0, player.power - 2.5);
      player.impact = 0.65;
      game.shake = Math.max(game.shake, reducedMotion ? 0 : 2.7);
      game.damage = 0.1;
      sound.hit();
      spawnSparks(surface.w / 2, surface.h * 0.77, 13);
    }
  }

  game.displayPosition = free ? roadPosition() : livePosition();

  if (!free) {
    // Progress callouts, rate limited so they never stack up.
    if (game.displayPosition < game.lastPass && game.raceTime > 1.6 && game.messageTime < 0.2) {
      if (game.displayPosition === 1) showMessage('TAKE THE LEAD', 1.5);
      else if (game.displayPosition <= 10 && game.placesNotice > 10) showMessage('TOP 10', 1.3);
      else if (game.placesNotice - game.displayPosition >= 10)
        showMessage('POSITION ' + String(game.displayPosition).padStart(3, '0') + ' / 100', 1.0);
      if (game.placesNotice - game.displayPosition >= 10 || game.displayPosition <= 10)
        game.placesNotice = game.displayPosition;
    }
    game.lastPass = game.displayPosition;

    updateRaceLaps(oldS, dt);
    if (game.mode === 'race' && player.power <= 0) finishRace(true);
    if (
      game.mode === 'race' &&
      oldS < RACE_DISTANCE - total * 0.18 &&
      player.s >= RACE_DISTANCE - total * 0.18
    )
      showMessage('FINAL SECTOR', 1.1);
    el.driveHint.style.opacity = game.raceTime < 5 ? '1' : '0';
  } else {
    updateFreeLap(oldS, dt);
    game.finishAge += dt;
    // Free drive never ends because the power meter emptied.
    if (player.power <= 0) {
      player.power = 8;
      player.boostLock = true;
      showMessage('RESERVE POWER', 1.0);
    }
    el.driveHint.style.opacity = game.messageTime > 0 ? '0' : '.8';
  }
}

/** Hands the craft to the auto pilot for the finish camera orbit. */
export function updateAutoPilot(dt: number): void {
  const oldS = player.s;
  game.finishAge += dt;
  game.cinemaAge += dt;

  player.v = lerp(player.v, BASE * 1.04, 1 - Math.exp(-dt * 1.7));
  const targetX = Math.sin(player.s * 0.0018) * 13;
  player.x = lerp(player.x, targetX, 1 - Math.exp(-dt * 3.0));
  player.latV = 0;
  player.kickV *= Math.exp(-dt * 8);
  player.bounceTime = 0;
  player.steer = lerp(
    player.steer,
    clamp(-sample(player.s).curve * 190, -0.55, 0.55),
    1 - Math.exp(-dt * 5),
  );
  player.power = Math.min(100, player.power + 6 * dt);
  player.boosting = false;
  player.s += player.v * dt;

  updateRivals(dt);
  updateFreeLap(oldS, dt);
  game.displayPosition = game.lapResult ? game.lapResult.position : roadPosition();
  if (game.finishAge > 1.15) el.countdown.classList.remove('show');
}
