# Three-dimensional circuits

Select **Skyline · 3D Stunt Circuit** on the title screen. It is the default and
contains a summit climb and descent, four banked bends, a full vertical loop,
a helical corkscrew with a full roll, and a valley dip. Race against the 99 AI
craft or create a 2–4-player room. Guests automatically load the host's course.
**Neon Harbor · Classic** preserves the original flat track and physics.

## Nine-lane start and twelve sections

Skyline is now 56,032 world units per lap: twice its previous length, with the same
cruising and boost speeds. The nine-lane launch apron is 588 units wide. All 99
rivals occupy nine staggered columns with 237 units between rows. The entire grid
fits before the first taper begins at 2,900 units.

One lane merges away in each of the first six sections. Adjacent groups pair up
across alternating parts of the road; lane markings and AI paths interpolate
smoothly. The sixth reduction finishes near the halfway point, about 30 seconds
into an unboosted lap, instead of the old roughly eight-second compression.

| Section | Feature         | Lanes | Reason                                       |
| ------- | --------------- | ----- | -------------------------------------------- |
| 1       | Launch straight | 9 → 8 | Space for the entire starting field          |
| 2       | Summit climb    | 8 → 7 | Long, gradual merge on the climb and descent |
| 3       | Sky bridge      | 7 → 6 | Clear sight line for the next merge          |
| 4       | High bank       | 6 → 5 | Generous room through the bank               |
| 5       | Vertical loop   | 5 → 4 | Spread the merge over the full inversion     |
| 6       | Carousel        | 4 → 3 | Complete the opening reductions              |
| 7       | Corkscrew       | 3 → 6 | Widen before the roll's apex                 |
| 8       | Ridge run       | 6 → 4 | Narrow gradually on the smoother ridge       |
| 9       | Sweeper         | 4 → 5 | Extra passing room in the bend               |
| 10      | Valley descent  | 5 → 4 | Moderate width through the dip               |
| 11      | Harbor straight | 4 → 3 | Narrow technical straight                    |
| 12      | Home bend       | 3 → 6 | More room through the final bank             |

All of sections 7–12 remain between three and six lanes, including transitions.
The start/finish line sits about 2,200 units into section 1. Its approach reopens
from six to nine lanes within section 1, then holds nine across the line and grid;
section 12 never exceeds six lanes. The section-1 start distance is therefore
negative, and its approach also occupies the end of the wrapped lap. There are
still exactly twelve sections and no width jump at the lap seam.

`track/launch.ts` owns the shared width and lane profile. The road mesh, rail
collisions, AI lane preferences and diagnostics use it consistently. AI anticipates
narrower road and merging traffic before moving inward, with no lateral snaps.
Online racers also start farther apart, and restarts/rematches restore the grid.
Skyline best times use a new storage version for the changed length and layout.

## Track representation

`src/track/spatial.ts` defines `SKYLINE_DESIGN` as local-space primitives. A segment
has a name, kind, length and target lane count, with additional parameters:

| Kind        | Parameters                 | Behaviour                                                                                                                                                             |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `straight`  | `length`                   | Advance along the current heading.                                                                                                                                    |
| `hill`      | `length`, `height`         | Smooth rise and fall; negative height creates a valley. The ends have zero grade and vertical curvature.                                                              |
| `bank`      | `length`, `radius`, `bank` | Horizontal arc through `length / radius` radians, with smoothly eased banking in radians. Negative bank lowers the inside/right edge on the current right-hand bends. |
| `loop`      | `length`, `radius`         | Full vertical inversion with forward advance and sideways separation between the legs. This leaves actual road-width clearance at the crossing.                       |
| `corkscrew` | `length`, `radius`         | Helical centre line and a full 360-degree roll; the entry and exit return to a level frame.                                                                           |

Design dimensions are authoring units. `buildSpatial` measures the resulting 3D
curve, scales it uniformly to the chosen lap length, and resamples by arc length.
Skyline uses twice the lap length of Classic without scaling vehicle speed.
The world positions really change in all
three dimensions; distance is never measured from the flattened minimap.

The final segment must meet the start position and heading smoothly. The builder
checks closure; the tests additionally check tangent and normal continuity around
the whole lap, including the seam. Sample spacing is about eight world units.
`sampleSpatial(s, lateral)` wraps any finite negative or multi-lap distance and
returns position, forward/right/up basis, signed lateral curvature and authored
bank. Sideways offsets follow the road's right vector, including upside down.

Authored heading provides a stable reference at vertical tangents, where a planar
heading alone is undefined. Orthogonalization keeps the interpolated basis valid.
Angular interpolation handles the 360-to-zero seam without an extra rotation.
`sampleCourse` dispatches to the active course; the original `sample` is unchanged
for the terrain bake and exact Classic parity checks.

## Physics and rendering

Steering, rail limits, impacts and lateral velocity all live in the road's frame.
Gravity projected along the forward axis slows climbs and speeds descents; its
projection across the bank affects lateral drift. AI craft receive the same grade
force. These anti-gravity craft maintain magnetic adhesion, including at low speed
and while inverted. There are no ballistic jumps or falling off an inversion.

The 3D renderer uses raw WebGL with a depth buffer, near-plane clipping and full
pitch/roll/yaw camera axes. Road, lane markings, boost and repair strips, walls,
craft, supports and the harbour are procedural meshes. Overlapping sections
occlude one another according to actual depth. The sky and harbour stay fixed in
world space while the camera rolls. The final image uses the existing 2D effects
and HUD pipeline. Mesh buffers are built once and rebuilt on context restoration.
No new rendering dependency or asset is required.

Browsers without WebGL can still play Classic and receive a visible explanation.
Such a browser cannot join a Skyline room; it must use a Classic room. Context
loss displays a restoration message and recreates the GPU resources when restored.
The selected course has its own best-time storage. A course cannot be changed
during a race or through the room UI after creation.

## Verification

- Unit tests check wrapping, true 3D distance, orthonormal frames, seam continuity,
  inversions, banking, separated road sections, and grade/sideways force directions.
  Launch checks cover nine-column spacing, every section width, the lap seam, and all 99
  AI craft driving through the taper with rail clearance and bounded steering.
- Browser tests drive three complete laps through normal keyboard input, record
  elevation and inversion telemetry, capture each major feature, then exercise the
  finish camera, free drive and a switch back to Classic.
- Browser tests also exercise WebGL loss/restoration and the unavailable-WebGL
  fallback. The four-player WebRTC race uses Skyline; one guest starts on Classic
  to verify host course synchronization.
- A launch browser test steers beyond the former road edge, drives all twelve section
  widths over a complete longer lap, checks rail clearance and lap accounting, and restarts the grid.
- The original parity suite explicitly selects `?course=classic`. This is an
  intentional new default course, not a change to the Classic comparison: every
  original numeric assertion and tolerance is retained. The reference HTML and
  original stylesheet remain untouched.

Run `pnpm verify`, `pnpm format:check`, and `pnpm test:e2e`. The browser suite opts
into Chromium's software WebGL implementation for CI, so it renders real 3D
geometry even without a hardware GPU.
