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

The course selector chooses between two renderers. **Skyline** uses a raw WebGL
mesh renderer (`render/spatial-renderer.ts`, `render/spatial-mesh.ts`) with depth
testing, a full 3D camera and procedural scenery. It copies the rendered image to
the existing scene canvas before HUD effects and final blitting. **Classic** uses
the unchanged Mode 7 path below. See [`TRACKS.md`](TRACKS.md) for geometry, course
authoring, track-relative forces, multiplayer synchronization and verification.

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

Classic's `drawCraft` cross-fades between a pre-rendered rear sprite and a
face-sorted 3D build. Chase races and distant rivals use sprites. The 3D form
appears off-axis in the finish orbit, interior views and camera feeds so the
craft's front and sides are visible from those angles.

### Pilot eye and cockpit

`render/driving-view.ts` is DOM-free camera state and geometry. Each body in
`config/vehicles.ts` defines mounts in mesh-local lateral / forward / height
coordinates. `vehiclePose` is shared by the exterior mesh and the mounted cameras;
`mountCamera` transforms the selected body's mount through that pose. The pilot
eye does not use a chase distance, boost displacement, orbit blend or screen shake.
Head yaw changes orientation around that eye, never its position. The keyboard
and touch look latches are independent of driving input, and are cleared on
pause, blur and visibility loss. View preference is optional local storage.

Cockpit panels are procedural canvases projected on cabin planes, including
near-plane clipping and perspective subdivision when looking through the side
windows. The wheel follows steering and the transparent windshield projection
uses the same speed conversion as the HUD. Portrait screens use a compact cabin
layout and a central traffic display without changing the vehicle mount.

`camera-feeds.ts` captures three low-resolution views at 15 Hz, only while the
cockpit is visible. Skyline reuses its WebGL buffers with independent viewport
passes. Classic temporarily borrows the raster surface and camera, restoring
every borrowed field in `finally`. The local craft is excluded from interior and
camera-feed passes; Classic enables its multi-angle mesh for side/front views.
`traffic.ts` computes signed lap-relative positions and closure from the active
AI or human field. Rear video is mirrored; side video and traffic positions use
the vehicle's left/right, independent of head yaw. These passes never update the
simulation or consume the shared world RNG.

`window.EZero.view` exposes copies of the view, vehicle pose, mounts, feed update
counters and nearby contacts. Unit tests cover mounts, alternate vehicle offsets,
inversions and lap-seam traffic. Browser tests drive both courses, boost, glance,
resize, pause, resume and restore preferences, with additional WebGL fallback and
online-field checks. The original Classic physics/world parity suite stays intact.

## Simulation

The active course is held in `track/course.ts`. `sampleCourse` returns a 3D road
frame; Classic delegates its position and curvature to the original sampler.
Skyline resolves gravity along and across the road, while magnetic adhesion holds
craft to its normal through loops and corkscrews. Skyline is twice Classic's lap
length and now uses twice its base cruising speed. `courseBaseSpeed()` and
`courseMaxSpeed()` supply player, AI, boost-pad, demo and autopilot speeds. The
km/h conversion stays fixed, while boost meters and engine modulation use the
active course's baseline. All active simulation, HUD, map and online lap math
uses `courseLength()` and `raceDistance()`. Boost/repair placement also follows
the selected length. The original terrain bake and Classic constants stay fixed.
Course selection changes best-time storage, never the cumulative-distance model.
Online room messages carry the host's validated course ID.

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
