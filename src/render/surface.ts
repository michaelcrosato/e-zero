/**
 * The drawing surfaces.
 *
 * The game renders into an offscreen `scene` canvas at an internal resolution
 * that tracks the window but stays modest on large displays, then blits that to
 * the visible canvas. The blit applies screen shake and a small overscan, which
 * is why the two surfaces are separate.
 */
import { el } from '../ui/dom';

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('E-Zero: this browser did not provide a 2D canvas context.');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

const scene = document.createElement('canvas');
scene.width = 768;
scene.height = 432;

const sceneCtx = context2d(scene);
const outCtx = context2d(el.screen);

/** Internal render state. `w`/`h` are the offscreen resolution, not CSS pixels. */
export const surface = {
  /** Offscreen canvas the scene is composed into. */
  scene,
  /** Context for the offscreen scene. */
  ctx: sceneCtx,
  /** Context for the visible canvas. */
  out: outCtx,
  w: 768,
  h: 432,
  /**
   * Scale factor for UI-space drawing (sky, fog, horizon) relative to the
   * 432-unit reference height, clamped so wide windows do not stretch the sky.
   */
  viewUnit: 1,
  frame: sceneCtx.createImageData(768, 432),
  /** 32-bit view over `frame`, written directly by the ground renderer. */
  pixels: new Uint32Array(0),
};
surface.pixels = new Uint32Array(surface.frame.data.buffer);

/**
 * Resizes both surfaces. Returns true when the internal resolution actually
 * changed, so callers can rebuild resolution-dependent buffers.
 */
export function resizeSurface(w: number, h: number): boolean {
  if (w === surface.w && h === surface.h) return false;
  surface.w = w;
  surface.h = h;
  surface.viewUnit = Math.min(h / 432, w / 600);
  el.screen.width = scene.width = w;
  el.screen.height = scene.height = h;
  // Resizing a canvas resets its context state.
  outCtx.imageSmoothingEnabled = false;
  sceneCtx.imageSmoothingEnabled = false;
  surface.frame = sceneCtx.createImageData(w, h);
  surface.pixels = new Uint32Array(surface.frame.data.buffer);
  return true;
}
