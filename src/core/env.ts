/** Environment capability checks, resolved once at load. */

const query = (q: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q).matches
    : false;

/**
 * When set, the renderer drops screen shake, ghost trails, speed lines and the
 * boost particle system, and slows the finish camera orbit.
 */
export const reducedMotion = query('(prefers-reduced-motion: reduce)');
