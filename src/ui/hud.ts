/**
 * HUD refresh.
 *
 * Driven at 25 Hz from the simulation rather than per frame, because every
 * update here touches the DOM and none of it needs 120 Hz resolution.
 */
import { BOOST_RATIO, FIELD_SIZE, RACE_LAPS } from '../config/constants';
import { clamp, mod } from '../core/math';
import { formatTime } from '../core/time';
import { drawMinimap } from '../render/minimap';
import { boostFX, game, player } from '../sim/state';
import { BASE, RACE_DISTANCE } from '../track/layout';
import { KMH } from '../config/constants';
import { total } from '../track/spline';
import { boostTouchButton, el } from './dom';

export function refreshBest(): void {
  el.bestTime.textContent = game.best ? 'BEST ' + formatTime(game.best) : 'BEST — — : — —';
}

export function showMessage(text: string, duration = 1.2): void {
  game.messageText = text;
  game.messageTime = duration;
  el.raceMessage.textContent = text;
  el.raceMessage.classList.add('show');
}

export function hideMessage(): void {
  el.raceMessage.classList.remove('show');
}

export function updateHUD(): void {
  const free = game.mode === 'free' || (game.mode === 'paused' && game.pausedMode === 'free');
  const post = !!game.lapResult && !game.lapResult.failed;

  const progress = free ? mod(player.s, total) / total : clamp(player.s / RACE_DISTANCE, 0, 1);
  const position = free ? game.displayPosition : (game.lapResult?.position ?? game.displayPosition);
  const currentLap = free
    ? Math.floor(player.s / total) + 1
    : Math.min(RACE_LAPS, Math.floor(player.s / total) + 1);

  el.positionValue.textContent = String(position).padStart(3, '0');
  el.fieldStatus.textContent = free
    ? 'FREE DRIVE'
    : position === 1
      ? 'RACE LEADER'
      : position === FIELD_SIZE
        ? 'START / LAST PLACE'
        : '+' + (FIELD_SIZE - position) + ' POSITIONS';

  el.powerValue.textContent = Math.ceil(player.power) + '%';
  el.powerFill.style.width = player.power + '%';
  el.powerFill.style.background =
    player.power < 28 ? '#ff65b6' : player.power < 50 ? '#ffc97d' : '#d5ff64';

  el.clockLabel.textContent = free ? 'LAP TIME' : 'RACE TIME';
  el.clock.textContent = formatTime(
    free ? game.freeLapTime : (game.lapResult?.time ?? game.raceTime),
  );
  el.speedValue.textContent = String(Math.round((player.v / BASE) * KMH)).padStart(3, '0');

  el.lapClock.textContent = free
    ? 'LAST ' + (game.lastFreeTime ? formatTime(game.lastFreeTime) : '—')
    : post
      ? '3 / 3 LAPS COMPLETE'
      : 'LAP ' + formatTime(Math.max(0, game.raceTime - game.lapStartTime));

  el.progressFill.style.width = progress * 100 + '%';
  el.distanceLabel.textContent = free
    ? 'FREE DRIVE · LAP ' + String(currentLap).padStart(2, '0')
    : Math.floor(progress * 100) + '% OF RACE';

  el.lapLabel.innerHTML =
    'LAP <b>' +
    String(currentLap).padStart(2, '0') +
    ' / ' +
    (free ? '∞' : String(RACE_LAPS).padStart(2, '0')) +
    '</b>';
  el.lapSplit.textContent = game.lapTimes.length
    ? 'LAST ' + formatTime(game.lapTimes[game.lapTimes.length - 1])
    : '3 LAPS TO FINISH';

  const boosting = player.boosting && (game.mode === 'race' || game.mode === 'free');
  const low = player.power <= 15 || player.boostLock;
  el.boostState.classList.toggle('active', boosting);
  el.boostState.classList.toggle('low', !boosting && low);
  el.boostLabel.textContent = boosting
    ? 'HYPER · ' + (player.v / BASE).toFixed(2) + '×'
    : low
      ? 'POWER LOW'
      : 'BOOST READY';

  el.stage.classList.toggle('hyper', boosting);
  el.boostCallout.classList.toggle('show', boosting && boostFX.age < 1.15);
  boostTouchButton?.classList.toggle('firing', boosting);

  const boostLevel = Math.round(clamp((player.v / BASE - 1) / (BOOST_RATIO - 1), 0, 1) * 12);
  [...el.boostMeter.children].forEach((node, i) => node.classList.toggle('lit', i < boostLevel));

  el.damageFlash.style.opacity = String(game.damage);
  drawMinimap();
}
