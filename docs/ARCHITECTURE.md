# Architecture

## Layering

Modules are arranged so that dependencies point downward. The lower layers have
no DOM dependency at all, which is what makes them unit-testable in Node.

```
main.ts                     boot sequence, wiring, loop start
  │
  ├── game/flow.ts          mode transitions (the only place modes change)
  ├── sim/update.ts         one fixed step, dispatched by mode
  ├── render/renderer.ts    camera solve + frame assembly
  │
  ├── ui/                   DOM: hud, input, viewport, dom handles, announce
  ├── audio/                Web Audio graph and music routing
  ├── online/               validated room protocol, host lifecycle, lazy WebRTC session
  │
  ├── sim/                  physics, rivals, boost, scenery, state
  ├── render/               ground, sky, craft, props, effects, minimap, sprites
  │
  ├── track/                spline, layout, terrain bake      ← no DOM except terrain
  └── core/ + config/       math, rng, time, loop, env, constants   ← pure
```

## Boot order matters

`initTerrain` and `initSky` both draw from the **same seeded RNG stream**, and
the draw order is part of the world's identity: change it and the terrain
speckle, island windows, star field and skyline all come out different.

The original single-file build got this ordering implicitly from top-to-bottom
script execution. Under ES modules, evaluation order follows the import graph,
which is not something to rely on for this. So world generation is **not** an
import-time side effect — `main.ts` calls the two initialisers explicitly, in
order. Do not move this into module top-level code.

## Mutable state

Cross-module mutable state lives in exported objects (`game`, `player`, `camera`,
`boostFX`, `surface`, `viewport`), never in reassigned `let` bindings.

`player` in particular is a `const` object that is mutated in place — `resetPlayer`
does `Object.assign(player, createPlayer())` rather than swapping the reference.
This keeps the dense physics code reading as `player.x` and guarantees every
module observes the same object.

## The render pipeline

Per frame, in order:

1. **`solveCamera`** — position, height, focal length and horizon, blended
   between the race chase camera and the orbiting finish camera.
2. **`drawSky`** — gradient, stars, sun, two parallax skyline layers. Drawn in a
   fixed `SKY_H`-tall reference space and scaled to the current horizon.
3. **`drawGround`** — the Mode 7 loop. The hot path of the whole game: one
   texture read per pixel below the horizon, writing into a `Uint32Array` view
   over an `ImageData`.
4. **`drawObjects`** — scenery and all 100 craft in a single back-to-front sort,
   so a rival can correctly pass behind a sign.
5. **`drawSpeed`**, **`drawBoostFX`**, sparks.
6. **Blit** — the offscreen scene is copied to the visible canvas with screen
   shake and boost vibration, plus a 2px overscan so shake never exposes an edge.

### Two craft representations

`drawCraft` cross-fades between a pre-rendered sprite (used for the whole race
and every distant rival) and a face-sorted 3D build. The 3D form only appears
once the finish camera swings off-axis, which is the only time you can see
anything but the craft's rear.

## Simulation

Fixed 120 Hz step (`FIXED_STEP`), accumulated against wall time and capped at
`MAX_STEPS_PER_FRAME` so a backgrounded tab resumes rather than trying to
simulate the whole gap.

Speed, steering and lateral motion are exponential approaches of the form
`lerp(current, target, 1 - exp(-dt * k))`, which are stable at any step size.

Rail contact sets `kickV`, a lateral velocity that steering deliberately cannot
cancel — a bounce always costs you the line. `railLock` prevents one contact
retriggering every step.

The 99 rivals have fixed paces, lanes and boost schedules decided at build time,
so the field is identical every race and nothing rubber-bands. Overtaking comes
from `planTraffic`, which runs at 8 Hz (not 120 Hz), sorts the field by lap
distance, and scores candidate lanes against a window of neighbours.

## Invariants

Online state is a DOM-free exported object. The transport lives outside the
simulation and publishes validated snapshots; physics still reads only `dt`.
Online races use human craft in place of the AI field. Solo follows the original
code paths, preserving the exact world and physics parity tests. See
[`MULTIPLAYER.md`](MULTIPLAYER.md) for authority, timing and lifecycle details.

These hold across the codebase. Breaking one is a bug even if nothing throws:

- `sample(s)` and `widthAt(s)` accept **any** `s`, including negative and
  multi-lap values. They wrap. Never pre-wrap before calling them.
- `player.s` is cumulative and never wraps. Lap number is `floor(player.s / total)`.
- Anything derived from the shared `random()` stream must keep its draw order.
- The simulation must not read `Date.now()` or `performance.now()`; it only ever
  sees `dt`.
- `game.mode` is only ever assigned in `game/flow.ts` and `sim/update.ts`.
- Screen-space particle systems are cleared on resize, because their coordinates
  are meaningless at a new resolution.

## Diagnostics

`window.EZero` is a frozen, read-only view of live state (`state`, `stats`,
`field`, `viewport`, `audio`, `result`). It exists so the build can be verified
from outside the bundle — the browser tests and the original-parity harness both
drive the game entirely through it. It must stay side-effect free.
