import { expect, test } from '@playwright/test';
import { driveCentreLine } from './driver';

test('uses all six launch lanes and merges smoothly to three during a real race', async ({
  page,
}, testInfo) => {
  await page.goto('/?course=skyline');
  await page.locator('#startButton').click();
  const start = await page.evaluate(() => ({
    stats: window.EZero.stats,
    field: window.EZero.field,
  }));
  expect(start.stats.lanes).toBe(6);
  expect(start.stats.halfWidth).toBe(196);
  expect(new Set(start.field.map((r) => r.x)).size).toBe(6);
  expect(start.field.some((r) => r.x > 150)).toBe(true);
  expect(start.field.some((r) => r.x < -150)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('six-lane-grid.png') });
  await page.waitForFunction(() => window.EZero.state === 'race');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.EZero.stats.lateral > 125);
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.EZero.stats.railHits)).toBe(0);
  await driveCentreLine(page);
  for (const lanes of [5, 4, 3]) {
    await page.waitForFunction((lanes) => window.EZero.stats.lanes === lanes, lanes);
    const state = await page.evaluate(() => ({
      stats: window.EZero.stats,
      field: window.EZero.field,
    }));
    expect(state.stats.halfWidth).toBeLessThanOrEqual((98 * lanes) / 3 + 0.1);
    expect(state.stats.railHits).toBe(0);
    expect(state.field.every((r) => Math.abs(r.x) + 22 < r.halfWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${lanes}-lanes.png`) });
  }
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.EZero.state === 'countdown');
  const reset = await page.evaluate(() => window.EZero.field.map((r) => ({ s: r.s, x: r.x })));
  expect(reset).toEqual(start.field.map((r) => ({ s: r.s, x: r.x })));
});
