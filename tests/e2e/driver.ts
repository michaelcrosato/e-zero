import type { Page } from '@playwright/test';

/** A test driver using only normal keyboard events and read-only telemetry. */
export async function driveCentreLine(page: Page): Promise<void> {
  await page.evaluate(() => {
    const held = new Set<string>();
    const timer = window.setInterval(() => {
      if (window.EZero.state === 'countdown') return;
      if (window.EZero.state !== 'race') {
        for (const code of held) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
        window.clearInterval(timer);
        return;
      }
      const stats = window.EZero.stats;
      const desired = -stats.lateral * 4 - stats.lateralDrift;
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
  });
}
