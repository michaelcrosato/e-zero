import { test, expect } from '@playwright/test';
import { driveCentreLine } from './driver';

test('keeps Classic playable when WebGL is unavailable and explains the fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId === 'webgl') return null;
      return Reflect.apply(original, this, [contextId, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('#courseSelect')).toHaveValue('classic');
  await expect(page.locator('#courseNote')).toContainText('3D graphics unavailable');
  await page.locator('#startButton').click();
  await page.waitForFunction(() => window.EZero.state === 'race');
  expect(await page.evaluate(() => window.EZero.stats.course)).toBe('classic');
});

test('drives every 3D feature for three laps with a camera attached through inversions', async ({
  page,
}, testInfo) => {
  // Skyline now has twice the physical lap length at the same speed.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?course=skyline');
  await page.waitForFunction(() => !!window.EZero);
  expect(await page.evaluate(() => window.EZero.course.graphicsReady)).toBe(true);
  await page.locator('#startButton').click();
  await driveCentreLine(page);
  await page.waitForFunction(() => window.EZero.state === 'race');
  const observation = page.evaluate(
    () =>
      new Promise<{
        sections: string[];
        maxHeight: number;
        minHeight: number;
        inverted: string[];
        minCameraAgreement: number;
        final: string;
        maxLateral: number;
      }>((resolve) => {
        const sections = new Set<string>();
        const inverted = new Set<string>();
        let maxHeight = -Infinity;
        let minHeight = Infinity;
        let minCameraAgreement = 1;
        let maxLateral = 0;
        const timer = window.setInterval(() => {
          const stats = window.EZero.stats;
          const camera = window.EZero.course.camera;
          sections.add(stats.section);
          maxHeight = Math.max(maxHeight, stats.elevation);
          minHeight = Math.min(minHeight, stats.elevation);
          maxLateral = Math.max(maxLateral, Math.abs(stats.lateral));
          if (stats.up.z < -0.5) inverted.add(stats.section);
          if (window.EZero.state === 'race')
            minCameraAgreement = Math.min(
              minCameraAgreement,
              camera.up.x * stats.up.x + camera.up.y * stats.up.y + camera.up.z * stats.up.z,
            );
          if (window.EZero.state === 'victory' || window.EZero.state === 'results') {
            window.clearInterval(timer);
            resolve({
              sections: [...sections],
              inverted: [...inverted],
              maxHeight,
              minHeight,
              minCameraAgreement,
              final: window.EZero.state,
              maxLateral,
            });
          }
        }, 80);
      }),
  );
  for (const name of ['Summit climb', 'High bank', 'Vertical loop', 'Corkscrew']) {
    await page.waitForFunction(
      (name) =>
        window.EZero.stats.section === name &&
        (name === 'Vertical loop' || name === 'Corkscrew' ? window.EZero.stats.up.z < -0.7 : true),
      name,
      { timeout: 70_000 },
    );
    const file = testInfo.outputPath(name.replaceAll(' ', '-') + '.png');
    await page.screenshot({ path: file });
    await testInfo.attach(name, { path: file, contentType: 'image/png' });
  }
  const seen = await observation;
  expect(seen.final).toBe('victory');
  expect(seen.sections).toHaveLength(12);
  expect(seen.sections).toEqual(
    expect.arrayContaining([
      'Summit climb',
      'High bank',
      'Vertical loop',
      'Corkscrew',
      'Valley descent',
    ]),
  );
  expect(seen.inverted).toEqual(expect.arrayContaining(['Vertical loop', 'Corkscrew']));
  expect(seen.maxHeight - seen.minHeight).toBeGreaterThan(1000);
  expect(seen.minCameraAgreement).toBeGreaterThan(0.8);
  const result = await page.evaluate(() => window.EZero.result);
  expect(result?.failed).toBe(false);
  expect(result?.laps).toHaveLength(3);
  expect(result?.laps.every((lap) => lap > 45)).toBe(true);
  expect(await page.evaluate(() => window.EZero.stats.lap)).toBe(3);
  await page.locator('#continueButton').click();
  await page.waitForFunction(() => window.EZero.state === 'free');
  await page.keyboard.press('x');
  await page.locator('#courseSelect').selectOption('classic');
  expect(await page.evaluate(() => window.EZero.stats.course)).toBe('classic');
  expect(await page.evaluate(() => window.EZero.stats.elevation)).toBe(0);
  expect(errors).toEqual([]);
});

test('restores WebGL resources after context loss without resetting the race', async ({ page }) => {
  await page.goto('/?course=skyline');
  await page.locator('#startButton').click();
  await page.waitForFunction(() => window.EZero.state === 'race');
  await page.keyboard.press('Escape');
  const before = await page.evaluate(() => window.EZero.stats.time);
  await page.evaluate(() => {
    const canvas = document.getElementById('spatialCanvas') as HTMLCanvasElement;
    const extension = canvas.getContext('webgl')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context-loss extension unavailable');
    extension.loseContext();
    window.setTimeout(() => extension.restoreContext(), 300);
  });
  await page.waitForFunction(() => window.EZero.course.graphicsLost);
  await page.waitForFunction(
    () => window.EZero.course.graphicsReady && !window.EZero.course.graphicsLost,
  );
  expect(await page.evaluate(() => window.EZero.stats.time)).toBe(before);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.EZero.stats.time > 1);
  expect(await page.evaluate(() => window.EZero.course.drawnCraft)).toBeGreaterThan(0);
});
