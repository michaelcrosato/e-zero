# Audio

## What ships in this repository

All of it is synthesised at runtime with Web Audio, and none of it is a file:

- **Engine** — a sawtooth and a triangle oscillator through a lowpass filter,
  with frequency and cutoff driven by speed.
- **Jet wash** — looped noise through a bandpass, gated on boost intensity.
- **Boost ignition** — a noise sweep from 420 Hz to 5.4 kHz under two tones.
- **Effects** — rail hits, boost pads, countdown beeps, the finish fanfare.

The game is fully playable with sound, with no downloads.

## What does not ship: the race music

The original single-file build embedded a 4.4 MB MP3 as a base64 data URI. Its
ID3 tags identify it as:

```
Title:      Mute City
Artist:     Yumiko Kanki
Album:      F-Zero
Copyright:  1990 Nintendo
```

That is a commercial game soundtrack. It is **not** in this repository and is
**not** deployed, because this is a public repo and a public site, and
redistributing it there would be copyright infringement. `public/audio/*.mp3` is
in `.gitignore` so it cannot be committed by accident.

This was a judgement call made while unpacking, not a request from the project
owner — if you hold the rights, or you are working locally, see below.

## Adding music back

The game loads `/audio/mute-city.mp3` if it is there and silently continues if it
is not. There is no build step and no code change:

```
public/audio/mute-city.mp3
```

Drop any MP3 at that path and it becomes the race music. It starts with the
countdown, loops, pauses with the race, and is routed through the same mute
control as the effects.

To use a different filename, change the `src` on `#raceMusic` in `index.html`.

## Failure handling

Missing or blocked music is a normal state, not an error:

- **File absent** — the element fails to load, `EZero.audio.available` is false,
  and the race runs on synthesised audio alone.
- **Autoplay blocked** — browsers refuse `play()` before a user gesture. The
  game detects `NotAllowedError`, announces it to the live region, and retries on
  the first pointer or key event.
- **No `createMediaElementSource`** — the mixer stage is skipped and the element
  plays natively at a fixed level.

`window.EZero.audio` reports what actually happened: `{ enabled, track,
available, playing, currentTime, duration, loop, readyState, contextState,
musicGain, error }`.

## If you are replacing the music properly

Reasonable sources for something you can actually ship publicly:

- Compose it — the existing Web Audio graph already has a synth in it.
- Creative Commons / public domain tracks with attribution compatible with MIT.
- Commissioned or licensed work.

Keep it under a few MB and 128–192 kbps; the original was 320 kbps, which is
well past what this needs.
