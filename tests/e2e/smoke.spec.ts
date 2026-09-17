import { expect, test, type Page } from '@playwright/test';

/** Waits for the boot sequence to publish the diagnostics API. */
async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.EZero !== 'undefined', null, { timeout: 30_000 });
}

test.describe('E-Zero boots and races', () => {
  test('reaches the title screen with the world built', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/');
    await waitForBoot(page);

    expect(await page.evaluate(() => window.EZero.state)).toBe('title');

    const stats = await page.evaluate(() => window.EZero.stats);
    expect(stats.rivalCount).toBe(99);
    expect(stats.fieldSize).toBe(100);
    expect(stats.totalLaps).toBe(3);
    expect(stats.trackLength as number).toBeGreaterThan(0);

    // The loading card must be gone once the terrain bake has finished.
    await expect(page.locator('#loading')).toHaveClass(/hidden/);

    // The canvas must have a real backing size, not the 0x0 of a failed layout.
    const viewport = await page.evaluate(() => window.EZero.viewport);
    expect(viewport.renderWidth as number).toBeGreaterThan(0);
    expect(viewport.renderHeight as number).toBeGreaterThan(0);

    expect(errors).toEqual([]);
  });

  test('renders actual pixels rather than an empty canvas', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);
    // Let the attract-mode camera run a few frames.
    await page.waitForFunction(() => window.EZero.stats.fps > 0, null, { timeout: 15_000 });

    const distinctColours = await page.evaluate(() => {
      const canvas = document.getElementById('screen') as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 97) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      }
      return seen.size;
    });
    // A blank or single-colour frame would mean the renderer never ran.
    expect(distinctColours).toBeGreaterThan(20);
  });

  test('starts a race, counts down, and makes progress', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);

    await page.locator('#startButton').click();
    expect(await page.evaluate(() => window.EZero.state)).toBe('countdown');

    await page.waitForFunction(() => window.EZero.state === 'race', null, { timeout: 20_000 });

    // Boost from the line. Coasting from a standing start does not pass anyone
    // in the first seconds, which is the point of the boost mechanic.
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.EZero.stats.time > 2, null, { timeout: 20_000 });
    const stats = await page.evaluate(() => window.EZero.stats);
    await page.keyboard.up('Space');

    expect(stats.speed as number).toBeGreaterThan(0);
    expect(stats.progress as number).toBeGreaterThan(0);
    expect(stats.power as number).toBeGreaterThan(0);
    // Starting last of 100, a boosted opening lap should already be passing cars.
    expect(stats.position as number).toBeLessThan(95);
  });

  test('boost raises speed above the cruise pace and drains power', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.EZero.state === 'race', null, { timeout: 20_000 });
    await page.waitForFunction(() => window.EZero.stats.time > 1, null, { timeout: 20_000 });

    const before = await page.evaluate(() => window.EZero.stats);

    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.EZero.stats.boosting === true, null, { timeout: 5000 });
    await page.waitForTimeout(1200);
    const during = await page.evaluate(() => window.EZero.stats);
    await page.keyboard.up('Space');

    expect(during.speed as number).toBeGreaterThan(before.speed as number);
    expect(during.power as number).toBeLessThan(before.power as number);
    expect(during.boostFX as number).toBeGreaterThan(0);
  });

  test('pauses and resumes without losing race time', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.EZero.state === 'race', null, { timeout: 20_000 });
    await page.waitForFunction(() => window.EZero.stats.time > 1, null, { timeout: 20_000 });

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.EZero.state)).toBe('paused');
    const paused = await page.evaluate(() => window.EZero.stats.time);

    // Race time must not advance while paused.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.EZero.stats.time)).toBeCloseTo(paused, 5);

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.EZero.state)).toBe('race');
    await page.waitForFunction((t) => window.EZero.stats.time > t, paused, { timeout: 10_000 });
  });

  test('exposes accessible controls and a live region', async ({ page }) => {
    await page.goto('/');
    await waitForBoot(page);
    await expect(page.locator('#announcer')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#screen')).toHaveAttribute('aria-label', /Race view/);
    await expect(page.locator('#soundButton')).toHaveAttribute('aria-label', /sound/i);

    await page.locator('#startButton').click();
    await expect(page.locator('#announcer')).not.toBeEmpty();
  });

  test('survives a resize mid-race without resetting the lap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForBoot(page);
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.EZero.state === 'race', null, { timeout: 20_000 });
    await page.waitForFunction(() => window.EZero.stats.time > 1.5, null, { timeout: 20_000 });

    const before = await page.evaluate(() => window.EZero.stats);
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.EZero.stats);

    expect(after.time as number).toBeGreaterThanOrEqual(before.time as number);
    expect(after.progress as number).toBeGreaterThanOrEqual(before.progress as number);

    const viewport = await page.evaluate(() => window.EZero.viewport);
    expect(viewport.renderWidth as number).toBeGreaterThan(0);
    expect(viewport.renderHeight as number).toBeGreaterThan(0);
  });
});
