/**
 * Original-vs-refactor parity.
 *
 * The unpacked build must behave exactly like the single-file original it came
 * from. Both expose the same read-only `window.EZero` API, so this loads each of
 * them in a real browser and compares.
 *
 * Two levels:
 *
 *  1. World fingerprint - compared EXACTLY. On the title screen nothing has been
 *     simulated yet, so every number here is a pure product of world generation:
 *     the spline, its arc-length resampling, the grid rotation, curvature, road
 *     width and the rival grid. A transcription slip in any of that maths shows
 *     up as an exact mismatch.
 *
 *  2. Race state - compared with tolerance. Both builds run a wall-clock driven
 *     fixed-step accumulator, so they can land a step or two apart; the sample is
 *     taken early, on the start straight, before any rail contact can amplify
 *     that into divergence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ORIGINAL = path.join(process.cwd(), 'reference', 'e-zero-v6.original.html');

/** Seconds of race time at which the dynamic sample is taken. */
const SAMPLE_AT = 2.0;

interface Fingerprint {
  trackLength: number;
  baseSpeed: number;
  legacyBaseSpeed: number;
  boostRatio: number;
  boostTopSpeed: number;
  speedMultiplier: number;
  fieldSize: number;
  rivalCount: number;
  totalLaps: number;
  halfWidthAtStart: number;
  curveAtStart: number;
  field: Array<{ id: number; s: number; x: number; pace: number; color: number }>;
}

interface RaceSample {
  time: number;
  progress: number;
  power: number;
  speed: number;
  position: number;
  lateral: number;
  leadRivalS: number;
}

async function waitForBoot(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.EZero !== 'undefined', null, { timeout: 45_000 });
}

/** Loads the refactored build from the preview server. */
async function openRefactor(page: Page): Promise<void> {
  await page.bringToFront();
  // Skyline deliberately adds 3D geometry and slope forces. Preserve every original assertion on Classic.
  await page.goto('/?course=classic');
  await waitForBoot(page);
}

/**
 * Loads the original single-file build.
 *
 * Served from a routed URL on the preview origin rather than injected with
 * `setContent`: that reuses the existing window, and both builds publish
 * `window.EZero` as a non-configurable property, so the second one to load
 * would fail to install its own. A real navigation gives it a fresh window,
 * and keeping the same origin means `localStorage` behaves identically too.
 */
const ORIGINAL_URL = '/__original__.html';

async function openOriginal(page: Page): Promise<void> {
  const html = fs.readFileSync(ORIGINAL, 'utf8');
  await page.route(`**${ORIGINAL_URL}`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  );
  await page.bringToFront();
  await page.goto(ORIGINAL_URL, { waitUntil: 'load', timeout: 60_000 });
  await waitForBoot(page);
}

function readFingerprint(page: Page): Promise<Fingerprint> {
  return page.evaluate(() => {
    const s = window.EZero.stats;
    return {
      trackLength: s.trackLength,
      baseSpeed: s.baseSpeed,
      legacyBaseSpeed: s.legacyBaseSpeed,
      boostRatio: s.boostRatio,
      boostTopSpeed: s.boostTopSpeed,
      speedMultiplier: s.speedMultiplier,
      fieldSize: s.fieldSize,
      rivalCount: s.rivalCount,
      totalLaps: s.totalLaps,
      halfWidthAtStart: s.halfWidth,
      curveAtStart: s.curve,
      field: window.EZero.field.map((r) => ({
        id: r.id,
        s: r.s,
        x: r.x,
        pace: r.pace,
        color: r.color,
      })),
    };
  });
}

/** Starts a hands-off race and samples once the clock passes `SAMPLE_AT`. */
async function readRaceSample(page: Page, at: number): Promise<RaceSample> {
  await page.evaluate(() => (document.getElementById('startButton') as HTMLButtonElement).click());
  await page.waitForFunction(() => window.EZero.state === 'race', null, { timeout: 30_000 });
  await page.waitForFunction((t) => window.EZero.stats.time >= t, at, { timeout: 30_000 });
  return page.evaluate(() => {
    const s = window.EZero.stats;
    const field = window.EZero.field;
    return {
      time: s.time,
      progress: s.progress,
      power: s.power,
      speed: s.speed,
      position: s.position,
      lateral: s.lateral,
      leadRivalS: Math.max(...field.map((r) => r.s)),
    };
  });
}

test.describe('parity with the original single-file build', () => {
  test('the reference original is present and carries no embedded audio', () => {
    expect(fs.existsSync(ORIGINAL)).toBe(true);
    const html = fs.readFileSync(ORIGINAL, 'utf8');
    expect(html).not.toContain('data:audio/mpeg;base64');
    expect(html).toContain('EZero');
  });

  test('world generation is numerically identical', async ({ page }) => {
    await openRefactor(page);
    const refactor = await readFingerprint(page);

    await openOriginal(page);
    const original = await readFingerprint(page);

    // Course geometry and pace constants, to the last bit.
    expect(refactor.trackLength).toBe(original.trackLength);
    expect(refactor.baseSpeed).toBe(original.baseSpeed);
    expect(refactor.legacyBaseSpeed).toBe(original.legacyBaseSpeed);
    expect(refactor.boostRatio).toBe(original.boostRatio);
    expect(refactor.boostTopSpeed).toBe(original.boostTopSpeed);
    expect(refactor.speedMultiplier).toBe(original.speedMultiplier);
    expect(refactor.halfWidthAtStart).toBe(original.halfWidthAtStart);
    expect(refactor.curveAtStart).toBe(original.curveAtStart);

    // Field composition.
    expect(refactor.fieldSize).toBe(original.fieldSize);
    expect(refactor.rivalCount).toBe(original.rivalCount);
    expect(refactor.totalLaps).toBe(original.totalLaps);

    // Every rival's grid slot, livery and pace.
    expect(refactor.field).toEqual(original.field);
  });

  test('race physics track the original', async ({ page }) => {
    // Both builds run in the SAME page, one after the other. They auto-pause
    // when the document is hidden and rAF is throttled in a background tab, so
    // only one of them may be live at a time.
    await openRefactor(page);
    const refactor = await readRaceSample(page, SAMPLE_AT);

    await openOriginal(page);
    const original = await readRaceSample(page, SAMPLE_AT);

    // Normalise for the step or two of jitter between the two accumulators.
    const scale = original.time / refactor.time;
    expect(scale).toBeGreaterThan(0.97);
    expect(scale).toBeLessThan(1.03);

    const relative = (a: number, b: number): number =>
      Math.abs(a - b) / Math.max(1e-9, Math.abs(b));

    expect(relative(refactor.progress, original.progress)).toBeLessThan(0.02);
    expect(relative(refactor.speed, original.speed)).toBeLessThan(0.02);
    expect(relative(refactor.leadRivalS, original.leadRivalS)).toBeLessThan(0.02);
    expect(Math.abs(refactor.power - original.power)).toBeLessThan(2);
    // Still on the start straight, so neither build should have drifted far.
    expect(Math.abs(refactor.lateral - original.lateral)).toBeLessThan(6);
    expect(Math.abs(refactor.position - original.position)).toBeLessThanOrEqual(6);
  });
});
