# Provenance

This repository is an unpacking of a single self-contained HTML file,
`e-zero-v6.html`, into a typed, tested, modular project.

## What the original was

| Section      | Size        | Share |
| ------------ | ----------- | ----- |
| Embedded MP3 | 5,872,822 B | 99.4% |
| JavaScript   | 68,675 B    | 1.2%  |
| CSS          | 41,307 B    | 0.7%  |
| Body markup  | 7,091 B     | 0.1%  |
| **Total**    | 5,990,636 B |       |

1,037 lines, of which one line — the base64 audio data URI — was 5.87 MB.

The JavaScript was a single IIFE in one global scope: ~850 dense lines covering
spline construction, a 4096² terrain bake, procedural sprite generation, a 99-car
AI field, fixed-step physics, a per-pixel Mode 7 renderer, HUD, input, audio and a
mode state machine.

## What was done

**Extracted verbatim.** CSS, markup and the MP3 were separated byte-faithfully
before anything else. The stylesheet is kept as one file because its rule order
is load-bearing, and splitting it risks silent cascade bugs for no real gain.

**Decomposed into modules.** The single scope became ~30 TypeScript modules in
layers, with dependencies pointing downward and the maths, RNG and track geometry
left free of any DOM dependency so they can be unit-tested in Node.

**Made behaviour-preserving, not redesigned.** Algorithms were moved, not
rewritten. Magic numbers were named where a name adds meaning and left alone
where the original comment already explained them. Nothing about how the game
plays was changed.

**Fixed the one thing implicit ordering hid.** World generation draws from a
shared seeded RNG, and the draw order is part of the world's identity. The
original got that ordering from top-to-bottom script execution; ES module
evaluation order would not reliably reproduce it, so `main.ts` now sequences it
explicitly. See `docs/ARCHITECTURE.md`.

**Removed the embedded audio.** See `docs/AUDIO.md`.

## How it is verified

`reference/e-zero-v6.original.html` is the original with the audio data URI
replaced by a path — same code, no copyrighted payload, 118 KB instead of 5.9 MB.

`tests/e2e/parity.spec.ts` loads both that and the unpacked build in a real
browser and compares them through the `window.EZero` API that both expose:

- World generation is compared **exactly** — course length, curvature, road width,
  pace constants, and all 99 rivals' grid positions, liveries and paces.
- Race physics is compared with tolerance, sampled early on the start straight.

If someone changes the physics or the track maths, that suite fails.

## Result

|               | Original | Unpacked                |
| ------------- | -------- | ----------------------- |
| Shipped bytes | 5.99 MB  | ~96 KB (~30 KB gzipped) |
| Files         | 1        | ~30 modules             |
| Types         | none     | strict TypeScript       |
| Tests         | none     | 38 unit + 10 browser    |
