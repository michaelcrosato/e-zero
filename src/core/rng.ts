/**
 * Seeded linear congruential generator.
 *
 * World generation (terrain speckle, skyline, star field) must be identical on
 * every load, so it draws from this rather than `Math.random`. Purely cosmetic,
 * per-frame randomness still uses `Math.random` because it must not consume
 * from this deterministic stream.
 */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The shared world-generation stream. Draw order is part of the world's identity. */
export const random = createRng(7152026);
