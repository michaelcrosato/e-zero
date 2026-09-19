# E-ZERO

[![CI](https://github.com/michaelcrosato/e-zero/actions/workflows/ci.yml/badge.svg)](https://github.com/michaelcrosato/e-zero/actions/workflows/ci.yml)

**[Play it →](https://e-zero-phvn.vercel.app)**

The default **Skyline Circuit** now has twelve distinct sections over twice its
previous length. Its nine-lane grid loses one lane per section for the first six
sections, then uses three to six lanes
for the remaining features: hills, banked turns, a vertical loop and
a corkscrew. The craft and chase camera follow the road through all three axes;
magnetic adhesion keeps you attached upside down. Choose **Neon Harbor · Classic**
in the circuit selector to race the original flat course.

A 100-racer, three-lap anti-gravity racer with private online races for 2–4 friends.
No image assets or game engine — the track, the city, the craft
and the sky are all generated in code at load time. Skyline uses a small WebGL
renderer with depth-tested road and craft geometry; Classic retains the original
Mode 7 per-pixel renderer. Neither needs a game engine or image assets.

You start **100th of 100**. Three laps. Boost costs power, rails cost you the
line, and the pink strip gives power back.

```
pnpm install
pnpm dev          # http://localhost:5319
```

## Controls

| Action     | Keys                              |
| ---------- | --------------------------------- |
| Steer      | `←` `→` or `A` `D`                |
| Boost      | `Space` or `Shift`                |
| Brake      | `↓` or `S`                        |
| Pause      | `Esc` or `P`                      |
| Restart    | `R`                               |
| Mute       | `M`                               |
| Exit       | `X`                               |
| View       | `V` — Chase / Pilot eye / Cockpit |
| Look       | Hold `Q` / `E` — left / right     |
| Auto pilot | `C` (after finishing / free run)  |

Touch controls appear automatically on coarse-pointer devices.

Choose a driving view on the title screen or use the camera button at any time.
The choice is remembered. **Pilot eye** is a clear first-person view from inside
the vehicle's glass canopy. **Cockpit** uses that same eye position and adds a
steering wheel, power instruments, a live rear-view mirror and an E / VISION
dashboard screen with left/right camera feeds and a nearby-traffic visualization.
Amber vehicles and arrows identify cars alongside or closing from behind. Speed
is projected onto the windshield. Hold Q / E or the on-screen LOOK buttons to
look out the side windows; release to face forward. Looking does not steer.

Both views work on Skyline, Classic and in online races. The camera remains at
the vehicle mount during boost, banking, loops and the finish sequence. Each
vehicle definition owns its pilot-eye and camera mounts, ready for future models.

## Play online

Choose **PLAY ONLINE**, enter a name, and **CREATE ROOM**. Share the invite link
or eight-character code with up to three friends. Everyone joining presses
**READY**, then the host starts the race. Three laps, live standings, and a shared
results screen; the host can return everyone to the lobby for a rematch.

Online is a head-to-head race with non-contact human craft and no AI. Each racer
has a matching craft colour in the lobby, world and map. Solo still has the original
99 AI rivals. Online races cannot be paused or restarted individually. Keep the
host's tab open; if the host leaves, the room closes. A disconnected guest is
marked disconnected in the standings.

Multiplayer uses WebRTC and public PeerJS signaling/relay services, with no account
or game server to configure. Some networks may block WebRTC; connection failures
return to the room screen with a retry message. See [multiplayer details](docs/MULTIPLAYER.md)
for deployment options, networking limits and browser checks.

## How it works

Skyline's centre line is resampled by **3D arc length**. Each sample stores forward,
right and up vectors, so road width, rails, craft, camera and steering rotate
together through vertical and inverted track. Climbs reduce speed, descents add
speed, and banking changes lateral drift. The course selector keeps best times
separate. Multiplayer rooms use the host's circuit automatically.

See [3D track authoring](docs/TRACKS.md) for the reusable hill, bank, loop and
corkscrew primitives and their tests.

### Classic renderer

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
tested, modular project. Classic preserves the original gameplay; Skyline adds
the 3D course described above. See
[`docs/PROVENANCE.md`](docs/PROVENANCE.md).

## Licence

[MIT](LICENSE).
