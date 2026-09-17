/**
 * Web Audio engine, effects and music routing.
 *
 * The engine note, jet wash and one-shot effects are synthesised here. Music is
 * an optional <audio> element: when the file is absent or the browser blocks
 * playback the race continues unchanged, and the mixer degrades to native
 * element playback if `createMediaElementSource` is unavailable.
 */
import { boostFX, game, player } from '../sim/state';
import { ACTIVE_MODES, PAUSABLE_MODES } from '../sim/types';
import { BASE } from '../track/layout';
import { announce } from '../ui/announce';
import { el } from '../ui/dom';

type AudioContextCtor = typeof AudioContext;

export class Sound {
  enabled = true;
  context: AudioContext | null = null;
  musicError: string | null = null;
  musicBlocked = false;

  private readonly music: HTMLAudioElement;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engine2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private jet: AudioBufferSourceNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private jetGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicGain: GainNode | null = null;

  constructor() {
    this.music = el.raceMusic;
    // This level also works when Web Audio is unavailable and the element plays natively.
    this.music.volume = 0.234;
    this.music.addEventListener('error', () => {
      this.musicError = this.music.error?.message || 'Music could not load.';
    });
  }

  /** Read-only view of the media element, for the diagnostics API. */
  get musicElement(): HTMLAudioElement {
    return this.music;
  }

  get musicGainValue(): number | null {
    return this.musicGain?.gain.value ?? null;
  }

  startMusic(): void {
    this.music.pause();
    try {
      this.music.currentTime = 0;
    } catch {
      // Seeking before metadata loads throws; playback still starts from zero.
    }
    this.musicError = null;
    this.musicBlocked = false;
    this.syncMusic();
  }

  syncMusic(): void {
    const active = ACTIVE_MODES.includes(game.mode);
    this.music.muted = !this.enabled;
    if (!active) {
      this.music.pause();
      if (game.mode === 'title' || game.mode === 'results') {
        try {
          this.music.currentTime = 0;
        } catch {
          // See startMusic.
        }
      }
      return;
    }
    // Muting does not reset the track. Pausing the race freezes its position.
    if (!this.music.paused) return;
    try {
      const request = this.music.play();
      if (request && typeof request.then === 'function') {
        request
          .then(() => {
            this.musicBlocked = false;
            this.musicError = null;
          })
          .catch((error: DOMException) => {
            // A pause or restart can cancel a play request. That is not a fault.
            if (error.name === 'AbortError') return;
            this.musicBlocked = error.name === 'NotAllowedError';
            this.musicError = error.name;
            if (this.enabled && PAUSABLE_MODES.includes(game.mode)) {
              announce(
                this.musicBlocked
                  ? 'Press a key or tap the game to enable music.'
                  : 'Music could not play. The race is still available.',
              );
            }
          });
      }
    } catch (error) {
      const name = (error as DOMException).name;
      this.musicError = name;
      this.musicBlocked = name === 'NotAllowedError';
    }
  }

  /** Lazily builds the audio graph. Safe to call repeatedly. */
  init(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      return;
    }
    try {
      const AC: AudioContextCtor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!AC) return;
      const a = new AC();
      this.context = a;

      this.master = a.createGain();
      this.master.gain.value = this.enabled ? 0.18 : 0;
      this.master.connect(a.destination);

      this.engine = a.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 70;
      this.filter = a.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 330;
      this.engineGain = a.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.filter).connect(this.engineGain).connect(this.master);
      this.engine.start();

      this.engine2 = a.createOscillator();
      this.engine2.type = 'triangle';
      this.engine2.frequency.value = 105;
      this.engine2.connect(this.engineGain);
      this.engine2.start();

      const buffer = a.createBuffer(1, a.sampleRate * 0.25, a.sampleRate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;

      this.jet = a.createBufferSource();
      this.jet.buffer = buffer;
      this.jet.loop = true;
      this.jetFilter = a.createBiquadFilter();
      this.jetFilter.type = 'bandpass';
      this.jetFilter.frequency.value = 1800;
      this.jetFilter.Q.value = 0.65;
      this.jetGain = a.createGain();
      this.jetGain.gain.value = 0;
      this.jet.connect(this.jetFilter).connect(this.jetGain).connect(this.master);
      this.jet.start();

      // Route the music through the same mute control as the effects.
      try {
        const gain = a.createGain();
        gain.gain.value = 1.3;
        const source = a.createMediaElementSource(this.music);
        source.connect(gain).connect(this.master);
        this.musicGain = gain;
        this.music.volume = 1;
      } catch {
        // Native media playback remains available without this mixer stage.
      }

      if (a.state === 'suspended') void a.resume().catch(() => {});
    } catch {
      this.context = null;
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.init();
    this.setVolume();
    el.soundButton.classList.toggle('off', !this.enabled);
    el.soundLabel.textContent = this.enabled ? 'SOUND ON' : 'SOUND OFF';
    el.soundButton.setAttribute('aria-label', this.enabled ? 'Turn sound off' : 'Turn sound on');
  }

  setVolume(): void {
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(
        this.enabled && game.mode !== 'paused' ? 0.18 : 0,
        this.context.currentTime,
        0.04,
      );
    }
    this.syncMusic();
  }

  tone(
    freq: number,
    duration = 0.12,
    volume = 0.18,
    type: OscillatorType = 'square',
    when = 0,
    end = 0,
  ): void {
    if (!this.context || !this.enabled || !this.master) return;
    const a = this.context;
    const t = when || a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.03);
  }

  noise(volume = 0.13, duration = 0.12, frequency = 900, when = 0): void {
    if (!this.context || !this.enabled || !this.noiseBuffer || !this.master) return;
    const a = this.context;
    const t = when || a.currentTime;
    const n = a.createBufferSource();
    const g = a.createGain();
    const f = a.createBiquadFilter();
    n.buffer = this.noiseBuffer;
    f.type = 'highpass';
    f.frequency.value = frequency;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + duration);
  }

  /** Boost ignition: a rising filtered noise sweep under two tones. */
  boost(): void {
    if (!this.context || !this.enabled || !this.noiseBuffer || !this.master) return;
    const a = this.context;
    const t = a.currentTime;
    const n = a.createBufferSource();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    n.buffer = this.noiseBuffer;
    n.loop = true;
    f.type = 'bandpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(5400, t + 0.33);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.075);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.6);
    this.tone(120, 0.3, 0.2, 'sine', t, 37);
    this.tone(220, 0.38, 0.055, 'sawtooth', t, 1100);
  }

  hit(): void {
    this.noise(0.45, 0.16, 350);
    this.tone(95, 0.15, 0.19, 'sawtooth', 0, 32);
  }

  pad(): void {
    [440, 660, 880].forEach((f, i) =>
      this.tone(f, 0.16, 0.1, 'square', (this.context?.currentTime || 0) + i * 0.055),
    );
  }

  finish(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.34, 0.15, 'square', (this.context?.currentTime || 0) + i * 0.12),
    );
  }

  /** Per-step engine and jet modulation. */
  update(): void {
    if (!this.context || !this.engine || !this.engine2 || !this.engineGain || !this.filter) return;
    const a = this.context;
    const t = a.currentTime;
    const active = ACTIVE_MODES.includes(game.mode);
    const ratio = player.v / BASE;
    if (this.jetGain && this.jetFilter) {
      this.jetGain.gain.setTargetAtTime(active ? boostFX.amount * 0.16 : 0, t, 0.045);
      this.jetFilter.frequency.setTargetAtTime(1200 + ratio * 1050, t, 0.08);
    }
    this.engineGain.gain.setTargetAtTime(active ? 0.045 + ratio * 0.045 : 0, t, 0.08);
    this.engine.frequency.setTargetAtTime(
      70 + ratio * 152 + Math.sin(game.worldTime * 19) * 2,
      t,
      0.06,
    );
    this.engine2.frequency.setTargetAtTime(100 + ratio * 203, t, 0.07);
    this.filter.frequency.setTargetAtTime(player.boosting ? 1800 : 260 + ratio * 320, t, 0.1);
  }
}

export const sound = new Sound();
