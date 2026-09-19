# Three-dimensional circuits

Select **Skyline · 3D Stunt Circuit** on the title screen. It is the default and
contains a summit climb and descent, four banked bends, a full vertical loop,
a helical corkscrew with a full roll, and a valley dip. Race against the 99 AI
craft or create a 2–4-player room. Guests automatically load the host's course.
**Neon Harbor · Classic** preserves the original flat track and physics.

## Six-lane start and progressive merges

Skyline starts at twice the normal road width: six lanes across a 392-unit apron.
All 99 rivals fit in six staggered columns before the taper begins, with 158 units
between rows (twice Classic's spacing). The first 11% of the circuit holds that
width; three successive, smooth merges reduce it to five, four, then three lanes
by 25% of the lap. The left pair merges first, then the right pair, then the centre.
The extra divider stripes converge into the rails or a surviving divider.

`track/launch.ts` owns this shared width and lane profile. The road mesh, rail
collisions, AI lane preferences and diagnostics use it consistently. AI anticipates
the narrower road and merging traffic before moving inward, with no lateral snaps.
The road reopens before the finish to join the launch apron smoothly on every lap;
it is a physical section, not a timed change beneath moving craft. Online racers
also start farther apart, and restarts/rematches restore the appropriate grid.
Skyline best times use a new storage version for the changed race layout.

## Track representation

`src/track/spatial.ts` defines `SKYLINE_DESIGN` as local-space primitives. A segment
has a name, kind and length, with additional parameters:

| Kind        | Parameters                 | Behaviour                                                                                                                                                             |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `straight`  | `length`                   | Advance along the current heading.                                                                                                                                    |
| `hill`      | `length`, `height`         | Smooth rise and fall; negative height creates a valley. The ends have zero grade and vertical curvature.                                                              |
| `bank`      | `length`, `radius`, `bank` | Horizontal arc through `length / radius` radians, with smoothly eased banking in radians. Negative bank lowers the inside/right edge on the current right-hand bends. |
| `loop`      | `length`, `radius`         | Full vertical inversion with forward advance and sideways separation between the legs. This leaves actual road-width clearance at the crossing.                       |
| `corkscrew` | `length`, `radius`         | Helical centre line and a full 360-degree roll; the entry and exit return to a level frame.                                                                           |

Design dimensions are authoring units. `buildSpatial` measures the resulting 3D
curve, scales it uniformly to the chosen lap length, and resamples by arc length.
Skyline uses the same lap length as Classic to retain the game's familiar speed
scale and approximate race duration. The world positions really change in all
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
  Launch checks cover six-column spacing, each lane drop, the lap seam, and all 99
  AI craft driving through the taper with rail clearance and bounded steering.
- Browser tests drive three complete laps through normal keyboard input, record
  elevation and inversion telemetry, capture each major feature, then exercise the
  finish camera, free drive and a switch back to Classic.
- Browser tests also exercise WebGL loss/restoration and the unavailable-WebGL
  fallback. The four-player WebRTC race uses Skyline; one guest starts on Classic
  to verify host course synchronization.
- A launch browser test steers beyond the former road edge, drives all three lane
  reductions, checks the field stays inside the rails, and restarts the grid.
- The original parity suite explicitly selects `?course=classic`. This is an
  intentional new default course, not a change to the Classic comparison: every
  original numeric assertion and tolerance is retained. The reference HTML and
  original stylesheet remain untouched.

Run `pnpm verify`, `pnpm format:check`, and `pnpm test:e2e`. The browser suite opts
into Chromium's software WebGL implementation for CI, so it renders real 3D
geometry even without a hardware GPU.
