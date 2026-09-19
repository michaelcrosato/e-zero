import { expect, test } from '@playwright/test';
import { driveCentreLine } from './driver';

test('starts in nine lanes and drives all twelve section-specific widths over a full longer lap', async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  await page.goto('/?course=skyline');
  await page.locator('#startButton').click();
  const start = await page.evaluate(() => ({
    stats: window.EZero.stats,
    field: window.EZero.field,
    sections: window.EZero.course.sections,
  }));
  expect(start.stats.lanes).toBe(9);
  expect(start.stats.halfWidth).toBe(294);
  expect(start.stats.trackLength).toBeGreaterThan(56_000);
  expect(start.sections).toHaveLength(12);
  expect(new Set(start.field.map((r) => r.x)).size).toBe(9);
  expect(start.field.some((r) => r.x > 250)).toBe(true);
  expect(start.field.some((r) => r.x < -250)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('nine-lane-grid.png') });
  await page.waitForFunction(() => window.EZero.state === 'race');
  expect(await driveCentreLine(page, 215)).toBeGreaterThan(215);
  expect(await page.evaluate(() => window.EZero.stats.railHits)).toBe(0);
  for (const part of start.sections) {
    // Sample after the merge settles, with enough road left for a slow CI frame.
    const fraction = part.index === 1 ? 0.97 : part.index <= 6 ? 0.9 : 0.6;
    const at = part.start + (part.end - part.start) * fraction;
    const snapshot = await page.waitForFunction(
      ({ index, at }) => {
        const stats = window.EZero.stats;
        if (stats.sectionIndex !== index || stats.progress * stats.trackLength < at) return null;
        // Capture in the matching tick; a second browser call can reach the next section.
        return { stats, field: window.EZero.field };
      },
      { index: part.index, at },
    );
    const state = await snapshot.jsonValue();
    await snapshot.dispose();
    if (!state) throw new Error('Section snapshot was not captured');
    expect(state.stats.sectionIndex).toBe(part.index);
    expect(state.stats.lanes).toBe(part.lanes);
    expect(state.stats.halfWidth).toBeCloseTo((98 * part.lanes) / 3, 6);
    expect(state.stats.railHits).toBe(0);
    expect(state.stats.lap).toBe(1);
    expect(state.field.every((r) => Math.abs(r.x) + 22 < r.halfWidth)).toBe(true);
    if (part.index === 6) expect(state.stats.time).toBeGreaterThan(25);
    await page.screenshot({
      path: testInfo.outputPath(`section-${part.index}-${part.lanes}-lanes.png`),
    });
  }
  await page.waitForFunction(() => window.EZero.stats.progress >= 1);
  expect(await page.evaluate(() => window.EZero.stats.lap)).toBe(2);
  expect(await page.evaluate(() => window.EZero.stats.lanes)).toBe(9);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.EZero.state === 'countdown');
  expect(await page.evaluate(() => window.EZero.field.map((r) => ({ s: r.s, x: r.x })))).toEqual(
    start.field.map((r) => ({ s: r.s, x: r.x })),
  );
});
