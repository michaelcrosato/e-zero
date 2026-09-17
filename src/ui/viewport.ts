/**
 * Viewport and resolution management.
 *
 * The stage is always 16:9, but the window is not, so this resolves the CSS
 * size of the stage, picks an internal render resolution that keeps the pixel
 * cost bounded on large displays, and publishes a `--u` unit that the HUD scales
 * with. A resize never resets the lap or changes travel speed.
 */
import { clamp } from '../core/math';
import { rebuildBoostEdge } from '../render/sprites';
import { resizeSurface, surface } from '../render/surface';
import { boostFX, sparkParticles } from '../sim/state';
import { el } from './dom';

export const viewport = {
  width: 768,
  height: 432,
  aspect: 16 / 9,
  /** CSS pixels per internal pixel. */
  pixelScale: 1,
  touch: false,
};

const coarsePointer =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)')
    : null;

/** Total pixels the internal buffer aims for, before clamping. */
const PIXEL_BUDGET = 720000;

let resizePending = false;

export function resizeViewport(): void {
  resizePending = false;

  // On mobile, the visual viewport excludes browser chrome. Ignore it while
  // pinch-zoomed, where its height is not the layout height.
  const vv = window.visualViewport;
  const visibleHeight = vv && Math.abs(vv.scale - 1) < 0.01 ? vv.height : window.innerHeight;
  el.app.style.setProperty('--view-height', Math.max(1, visibleHeight) + 'px');

  const rect = el.stage.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  viewport.width = width;
  viewport.height = height;
  viewport.aspect = width / height;
  viewport.touch = (coarsePointer?.matches ?? false) || width <= 600;
  el.app.classList.toggle('touch-layout', viewport.touch);

  document.documentElement.style.setProperty(
    '--u',
    clamp(Math.min(width / 1180, height / 720), 0.8, 2).toFixed(4) + 'px',
  );

  // Never render below 768x432, and hold roughly to the pixel budget above it.
  const pixelScale = Math.max(
    1,
    Math.min(width / 768, height / 432),
    Math.sqrt((width * height) / PIXEL_BUDGET),
  );
  viewport.pixelScale = pixelScale;

  const nextW = Math.max(1, Math.round(width / pixelScale));
  const nextH = Math.max(1, Math.round(height / pixelScale));

  if (!resizeSurface(nextW, nextH)) return;

  rebuildBoostEdge(surface.w, surface.h);
  // Screen-space particles would jump after a resize. Drop only those.
  boostFX.particles.length = 0;
  sparkParticles.length = 0;
}

export function scheduleResize(): void {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(resizeViewport);
}

/** Subscribes to every event that can change the stage size. */
export function bindViewport(): void {
  window.addEventListener('resize', scheduleResize, { passive: true });
  window.addEventListener('orientationchange', scheduleResize, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleResize, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleResize).observe(el.stage);
  coarsePointer?.addEventListener?.('change', scheduleResize);
}
