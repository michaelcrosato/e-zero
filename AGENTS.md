# Working in this repository

E-Zero is a browser racing game: a Catmull-Rom spline course, a 4096² baked
terrain texture, a per-pixel Mode 7 ground renderer, 99 AI rivals, and fixed-step
physics. It has no backend, no image assets and no game engine.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything in
`src/render/` or `src/sim/`. It is short and it will save you.

## Verify before claiming anything works

After every successful change request, run the relevant checks below, then commit
the task's changes and push the current branch to GitHub so the deployed game can
be playtested. This is standing user authorization; do not ask again. Never include
unrelated work or secrets, skip failing checks, or force-push. Report the commit
and push outcome; if a check or push fails, fix it or report the actual blocker.

```
pnpm verify        # typecheck + lint + unit tests + build
pnpm test:e2e      # browser suite, including original-parity
```

`pnpm verify` is the minimum before any commit. Run `pnpm test:e2e` as well for
any change to physics, the track, the renderer or the boot sequence — that is
the suite that can actually tell you the game still plays the same.

There is no "it should work". Run it and read the output.

## The parity suite is the safety net — do not weaken it

`tests/e2e/parity.spec.ts` compares this build against the original single-file
version in `reference/`, through the `window.EZero` API that both expose. World
generation is compared **exactly**.

If it fails, you changed behaviour. That is occasionally correct and usually not.
Do not loosen a tolerance or delete an assertion to make it pass — work out which
number moved and why. If a change is genuinely intended to alter behaviour, say
so explicitly and update the test in the same commit with a reason.

Never edit `reference/e-zero-v6.original.html`. It is the baseline.

## Invariants

Breaking one of these is a bug even when nothing throws:

- `sample(s)` and `widthAt(s)` take **any** `s` — negative, multi-lap, anything.
  They wrap internally. Do not pre-wrap before calling them.
- `player.s` is cumulative and never wraps. Lap is `floor(player.s / total)`.
- World generation order is part of the world's identity. `initTerrain` then
  `initSky`, both from the shared `random()` stream, sequenced explicitly in
  `main.ts`. Do not turn either into an import-time side effect.
- The simulation never reads the clock. It only sees `dt`.
- `game.mode` is assigned only in `game/flow.ts` and `sim/update.ts`.
- Screen-space particles are cleared on resize; their coordinates are otherwise
  meaningless at the new resolution.
- `window.EZero` is read-only and side-effect free.

## Conventions

- **TypeScript strict.** No `any`, no non-null `!` to silence the checker. If a
  DOM element is required, add it to `src/ui/dom.ts` so a missing element fails
  loudly at boot.
- **State lives in exported objects**, not reassigned `let` bindings. `player` is
  mutated in place, never swapped.
- **Comments explain why.** The code already says what. Existing comments in the
  render and physics code came from the original author and usually encode a real
  constraint — do not delete them as noise.
- **`src/style.css` is verbatim from the original and its rule order matters.**
  Do not reformat or split it. Prettier is configured to ignore it.
- Match the surrounding style. Bitwise `| 0` truncation in the renderer is
  deliberate and `no-bitwise` is off for that reason.

## Performance

`drawGround` in `src/render/ground.ts` is the hot loop — it runs once per pixel
below the horizon, every frame. Hoist to locals, avoid allocation, avoid property
lookups inside it. Anything at 120 Hz in `sim/` deserves the same care;
`planTraffic` is deliberately throttled to 8 Hz because it sorts the field.

Do not add a dependency to solve something the 60 lines of `src/core/math.ts`
already solve.

## Audio

Race music is an optional, unversioned drop-in file. Never commit an MP3, and
never make the game depend on one — see [`docs/AUDIO.md`](docs/AUDIO.md).
`public/audio/*.mp3` is gitignored deliberately.

## Ports

Dev runs on **5319**, preview on **4318**, both with `strictPort`. These are
deliberately unusual: 5173 and 4173 are commonly occupied by other projects on a
dev machine, and a silent port fallback means the test suite quietly runs against
someone else's app. If a port is taken, fix the conflict rather than changing
the port.
