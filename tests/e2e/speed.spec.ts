import { expect, test } from '@playwright/test';
import { COURSE_SCALE, KMH } from '../../src/config/constants';
import { driveCentreLine } from './driver';

for (const [course, multiplier] of [
  ['classic', 1],
  ['skyline', 2],
] as const) {
  test(`${course}: actual cruising speed, distance and boost match its course speed`, async ({
    page,
  }) => {
    await page.goto(`/?course=${course}`);
    await page.locator('#startButton').click();
    await driveCentreLine(page);
    const cruising = await page.waitForFunction(() => {
      const stats = window.EZero.stats;
      return stats.time >= 1 ? stats : null;
    });
    const stats = await cruising.jsonValue();
    if (!stats) throw new Error('Cruising sample was not captured');
    await cruising.dispose();
    expect(stats.baseSpeed).toBeCloseTo(stats.legacyBaseSpeed * COURSE_SCALE * multiplier, 10);
    expect(stats.speedMultiplier).toBe(COURSE_SCALE * multiplier);
    expect(stats.worldSpeed / stats.baseSpeed).toBeGreaterThan(0.97);
    expect(stats.worldSpeed / stats.baseSpeed).toBeLessThan(1.01);
    expect(stats.speed).toBeGreaterThan(KMH * multiplier * 0.97);
    expect(stats.speed).toBeLessThan(KMH * multiplier * 1.01);
    expect((stats.progress * stats.trackLength) / stats.time).toBeGreaterThan(
      stats.baseSpeed * 0.7,
    );
    expect(stats.boosting).toBe(false);
    expect(stats.railHits).toBe(0);
    await expect(page.locator('#boostMeter .lit')).toHaveCount(0);
    expect(stats.boostTopSpeed).toBe(KMH * multiplier * stats.boostRatio);

    await page.keyboard.down('Space');
    await page.waitForFunction(() => {
      const stats = window.EZero.stats;
      return stats.boosting && stats.worldSpeed > stats.baseSpeed * 2.3;
    });
    await expect(page.locator('#boostLabel')).toContainText('HYPER · 2.');
    await page.keyboard.up('Space');
  });
}

test('faster Skyline laps start a new record while Classic keeps its existing best', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('e-zero-best-v5-100-3', '123');
    localStorage.setItem('e-zero-best-v5-100-3-skyline-v3', '180');
  });
  await page.goto('/?course=classic');
  const classicBest = await page.locator('#bestTime').textContent();
  expect(classicBest).toContain('02:03');
  await page.locator('#courseSelect').selectOption('skyline');
  await expect(page.locator('#bestTime')).toHaveText('BEST — — : — —');
  await page.locator('#courseSelect').selectOption('classic');
  await expect(page.locator('#bestTime')).toHaveText(classicBest ?? '');
});
