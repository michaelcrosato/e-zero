import './online.css';
import { sound } from '../audio/sound';
import { formatTime } from '../core/time';
import { showTitle, startOnlineRace } from '../game/flow';
import { compareRacers } from '../online/protocol';
import { Session, normalizeCode } from '../online/session';
import { online, onlineActions } from '../online/state';
import { shipPalettes } from '../render/palettes';
import { game, player } from '../sim/state';
import { total } from '../track/spline';
import { el } from './dom';

const ui = { open: false, roster: '' };

function renderRoster(): void {
  const racers = online.racers
    .slice()
    .sort(online.racing ? compareRacers : (a, b) => a.slot - b.slot);
  const text = racers.map((r, i) => {
    const status =
      r.finishedAt !== null
        ? formatTime(r.finishedAt)
        : !r.connected
          ? 'DISCONNECTED'
          : r.failed
            ? 'POWER OUT'
            : online.racing
              ? `LAP ${Math.min(3, Math.floor(r.s / total) + 1)}/3`
              : r.ready
                ? 'READY'
                : 'NOT READY';
    return `${online.racing ? i + 1 : r.slot + 1}. ${r.name}${r.id === online.id ? ' (YOU)' : ''} · ${status}`;
  });
  const signature = text.join('\n');
  if (signature === ui.roster) return;
  ui.roster = signature;
  el.onlineRoster.replaceChildren(
    ...text.map((value, i) => {
      const li = document.createElement('li');
      li.textContent = value;
      li.style.borderLeftColor = shipPalettes[racers[i].slot].body;
      return li;
    }),
  );
  el.onlineStandings.textContent = text.join('\n');
}

function refresh(): void {
  const results = online.racing && (game.mode === 'results' || online.phase === 'finished');
  const panel = ui.open && (!online.racing || results);
  el.onlineOverlay.classList.toggle('hidden', !panel);
  if (ui.open) el.titleOverlay.classList.add('hidden');
  el.onlineSetup.hidden = online.active;
  el.onlineRoom.hidden = !online.active;
  el.onlineLeave.hidden = !online.active;
  el.onlineBack.hidden = online.active;
  el.onlineRaceExit.hidden = !online.racing;
  el.onlineStandings.hidden = !online.racing || results;
  el.onlineHeading.textContent = results
    ? online.phase === 'finished'
      ? 'RACE RESULTS'
      : 'FINISH LINE'
    : 'ONLINE RACE';
  el.onlineCode.textContent = online.code;
  el.onlineInvite.hidden = online.racing;
  el.onlineReady.hidden = online.host || online.racing;
  el.onlineReady.disabled = !session.canReady;
  const me = online.racers.find((r) => r.id === online.id);
  el.onlineReady.textContent = me?.ready ? 'NOT READY' : 'READY';
  el.onlineReady.setAttribute('aria-pressed', String(me?.ready ?? false));
  el.onlineStart.hidden = !online.host || online.racing;
  el.onlineStart.disabled = !session.canStart;
  el.onlineRematch.hidden = !online.host || online.phase !== 'finished';
  el.onlineCount.textContent = `${online.racers.length} / 4 PLAYERS`;
  if (results)
    el.onlineStatus.textContent =
      online.phase === 'finished'
        ? online.host
          ? 'Race complete. Return to the lobby for a rematch.'
          : 'Race complete. Waiting for the host to open the lobby.'
        : 'Waiting for the other racers to finish…';
  renderRoster();
}

const session = new Session({
  changed: refresh,
  status: (message) => {
    el.onlineStatus.textContent = message;
  },
  start: (delay) => {
    startOnlineRace(delay);
    (document.activeElement as HTMLElement | null)?.blur();
    refresh();
  },
  lobby: () => {
    showTitle();
    refresh();
  },
  left: () => {
    showTitle();
    refresh();
  },
  motion: () => ({
    s: player.s,
    x: player.x,
    v: player.v,
    boosting: player.boosting,
    finishedAt: game.lapResult && !game.lapResult.failed ? game.lapResult.time : null,
    failed: game.lapResult?.failed ?? false,
  }),
  countdown: (delay) => {
    if (game.mode === 'countdown') game.countTime = delay;
  },
});

function open(): void {
  ui.open = true;
  el.onlineStatus.textContent = 'Race with 2–4 friends. Three laps. Non-contact craft.';
  refresh();
  el.onlineName.focus();
}

export function bindOnline(): void {
  onlineActions.leave = () => session.leave();
  el.onlineButton.addEventListener('click', open);
  el.onlineCreate.addEventListener('click', () => {
    sound.init();
    void session.connect(el.onlineName.value);
  });
  el.onlineJoin.addEventListener('click', () => {
    const code = normalizeCode(el.onlineJoinCode.value);
    if (!code) {
      el.onlineStatus.textContent = 'Enter an 8-character room code.';
      el.onlineJoinCode.focus();
      return;
    }
    sound.init();
    void session.connect(el.onlineName.value, code);
  });
  el.onlineReady.addEventListener('click', () => {
    sound.init();
    session.ready(!online.racers.find((r) => r.id === online.id)?.ready);
  });
  el.onlineStart.addEventListener('click', () => {
    sound.init();
    session.start();
  });
  el.onlineRematch.addEventListener('click', () => session.rematch());
  el.onlineLeave.addEventListener('click', () => session.leave());
  el.onlineRaceExit.addEventListener('click', () => session.leave());
  el.onlineBack.addEventListener('click', () => {
    ui.open = false;
    showTitle();
    refresh();
  });
  el.onlineCopy.addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('room', online.code);
    if (!navigator.clipboard) {
      el.onlineStatus.textContent = 'Share this room code: ' + online.code;
      return;
    }
    void navigator.clipboard
      .writeText(url.href)
      .then(() => {
        el.onlineStatus.textContent = 'Invite link copied. Send it to your friends.';
      })
      .catch(() => {
        el.onlineStatus.textContent = 'Share this room code: ' + online.code;
      });
  });
  // The browser may restore this document from its back/forward cache.
  window.addEventListener('pagehide', () => {
    if (online.active) session.leave();
  });
  const code = normalizeCode(new URL(location.href).searchParams.get('room') ?? '');
  if (code) {
    el.onlineJoinCode.value = code;
    open();
  }
}
