# E-ZERO

A 100-racer, three-lap anti-gravity racer that runs entirely in the browser. No
network calls, no image assets, no game engine — the track, the city, the craft
and the sky are all generated in code at load time and drawn to a 2D canvas with
a Mode 7 style per-pixel ground renderer.

You start **100th of 100**. Three laps. Boost costs power, rails cost you the
line, and the pink strip gives power back.

```
pnpm install
pnpm dev          # http://localhost:5319
```

## Controls

| Action  | Keys                        |
| ------- | --------------------------- |
| Steer   | `←` `→` or `A` `D`          |
| Boost   | `Space` or `Shift`          |
| Brake   | `↓` or `S`                  |
| Pause   | `Esc` or `P`                |
| Restart | `R`                         |
| Mute    | `M`                         |
| Exit    | `X`                         |
| Camera  | `C` (auto pilot / free run) |

Touch controls appear automatically on coarse-pointer devices.

## How it works

The ground is not geometry. Every frame, each scanline below the horizon is a
constant distance from the camera, so the renderer walks that row through a
pre-baked 4096×4096 world texture, one texture read per pixel:

```
distance = cameraHeight * focal / (y - horizon)
```

Everything flat — water, city grid, islands, road surface, lane markings, boost
strips, the starting grid — is baked into that texture once at load. Only things
that stand up off the plane (craft, rail spheres, signs, the start gate) are
drawn as depth-sorted sprites on top.

The course itself is a closed Catmull-Rom spline, resampled at uniform arc length
so that equal steps of "distance along the course" are equal distances travelled.
That single property is what makes steering, lap timing and the 99 rivals'
positions all consistent.

Physics runs at a fixed 120 Hz step regardless of display refresh rate, so the
car handles identically on a 60 Hz and a 144 Hz screen.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module map.

## Scripts

| Script           | Does                                        |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | Dev server with HMR                         |
| `pnpm build`     | Typecheck, then production build to `dist/` |
| `pnpm preview`   | Serve the production build                  |
| `pnpm test`      | Unit tests (Vitest)                         |
| `pnpm test:e2e`  | Browser tests, including original-parity    |
| `pnpm lint`      | ESLint                                      |
| `pnpm typecheck` | `tsc --noEmit`                              |
| `pnpm verify`    | typecheck + lint + unit tests + build       |

Before running the browser suite once: `pnpm test:e2e:install`.

## Testing

Unit tests cover the DOM-free layer — maths, the seeded RNG, the spline and its
arc-length resampling, course layout and the rival field.

The browser suite additionally runs a **parity check against the original
single-file build** (`reference/e-zero-v6.original.html`). Both expose the same
read-only `window.EZero` diagnostics API, so the suite loads each in a real
browser and compares:

- **World generation** — compared exactly. Course length, curvature, road width,
  pace constants and all 99 rivals' grid slots, liveries and paces must match to
  the last bit.
- **Race physics** — compared with tolerance, sampled early on the start straight
  before rail contact can amplify step jitter into divergence.

This is what makes the unpacking verifiable rather than merely plausible.

## Audio

The game synthesises its engine, jet wash and effects with Web Audio. Race music
is an **optional** drop-in file that is deliberately not in this repository —
see [`docs/AUDIO.md`](docs/AUDIO.md). The game runs fully without it.

## Deploying

Configured for Vercel as a static Vite build (`vercel.json`). Any static host
works: `pnpm build` and serve `dist/`.

## Provenance

This repository is an unpacking of a single 5.9 MB HTML file into a typed,
tested, modular project. Nothing about how the game plays was redesigned. See
[`docs/PROVENANCE.md`](docs/PROVENANCE.md).

## Licence

[MIT](LICENSE).
