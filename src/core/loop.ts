/**
 * Fixed-timestep game loop.
 *
 * Physics always advances in slices of `FIXED_STEP` regardless of display
 * refresh rate, so handling is identical on a 60 Hz and a 144 Hz screen. Frame
 * time is capped and the catch-up is bounded, so a backgrounded tab resumes
 * instead of trying to simulate the whole gap at once.
 */
import { FIXED_STEP, MAX_FRAME_TIME, MAX_STEPS_PER_FRAME } from '../config/constants';

export interface LoopHandle {
  /** Measured frames per second, averaged over the last second. */
  readonly fps: number;
  stop(): void;
}

export function startLoop(update: (dt: number) => void, render: () => void): LoopHandle {
  let last = performance.now();
  let accumulator = 0;
  let renderCount = 0;
  let fpsTime = 0;
  let fps = 60;
  let running = true;
  let frameId = 0;

  function tick(now: number): void {
    if (!running) return;
    const elapsed = Math.min((now - last) / 1000, MAX_FRAME_TIME);
    last = now;
    accumulator += elapsed;

    let steps = 0;
    while (accumulator >= FIXED_STEP && steps++ < MAX_STEPS_PER_FRAME) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }

    render();

    renderCount++;
    fpsTime += elapsed;
    if (fpsTime >= 1) {
      fps = renderCount / fpsTime;
      renderCount = 0;
      fpsTime = 0;
    }
    frameId = requestAnimationFrame(tick);
  }

  frameId = requestAnimationFrame(tick);

  return {
    get fps(): number {
      return fps;
    },
    stop(): void {
      running = false;
      cancelAnimationFrame(frameId);
    },
  };
}
