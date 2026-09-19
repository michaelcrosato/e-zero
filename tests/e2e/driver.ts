import type { Page } from '@playwright/test';

/** Normal keyboard input only. An optional outer-lane visit returns to the centre continuously. */
export async function driveCentreLine(page: Page, outerThreshold = 0): Promise<number> {
  return page.evaluate(
    (outerThreshold) =>
      new Promise<number>((resolve, reject) => {
        const held = new Set<string>();
        let visiting = outerThreshold > 0;
        if (!visiting) resolve(0);
        const timer = window.setInterval(() => {
          if (window.EZero.state === 'countdown') return;
          if (window.EZero.state !== 'race') {
            for (const code of held) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
            window.clearInterval(timer);
            if (visiting) reject(new Error('Race ended before reaching the outer lane'));
            return;
          }
          const stats = window.EZero.stats;
          if (visiting && stats.lateral > outerThreshold) {
            visiting = false;
            resolve(stats.lateral);
          }
          // Keep the reversal in this browser tick. A Playwright round trip can leave
          // the craft coasting into a rail when other WebGL test pages load the CPU.
          const target = visiting ? outerThreshold + 30 : 0;
          const desired = (target - stats.lateral) * 4 - stats.lateralDrift;
          const key = desired > 18 ? 'ArrowRight' : desired < -18 ? 'ArrowLeft' : '';
          for (const code of ['ArrowLeft', 'ArrowRight']) {
            if (code === key && !held.has(code)) {
              window.dispatchEvent(new KeyboardEvent('keydown', { code }));
              held.add(code);
            }
            if (code !== key && held.has(code)) {
              window.dispatchEvent(new KeyboardEvent('keyup', { code }));
              held.delete(code);
            }
          }
        }, 40);
      }),
    outerThreshold,
  );
}
