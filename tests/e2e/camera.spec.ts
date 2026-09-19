import { expect, test, type Page } from '@playwright/test';
import { driveCentreLine } from './driver';

async function checkMount(page: Page): Promise<void> {
  // A view-selection event changes the preference before the next render. Inspect the
  // eye and live vehicle in the same completed animation frame, including after switching.
  const error = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const view = window.EZero.view;
          const pose = view.vehiclePose;
          const mount = view.mount,
            scale = view.scale;
          const expected = {
            x:
              pose.x +
              pose.right.x * mount.x * scale.x +
              pose.forward.x * mount.y * scale.y +
              pose.up.x * mount.z * scale.z,
            y:
              pose.y +
              pose.right.y * mount.x * scale.x +
              pose.forward.y * mount.y * scale.y +
              pose.up.y * mount.z * scale.z,
            z:
              pose.z +
              pose.right.z * mount.x * scale.x +
              pose.forward.z * mount.y * scale.y +
              pose.up.z * mount.z * scale.z,
          };
          resolve(
            Math.hypot(view.eye.x - expected.x, view.eye.y - expected.y, view.eye.z - expected.z),
          );
        }),
      ),
  );
  expect(error).toBeLessThan(1e-7);
}

for (const course of ['classic', 'skyline']) {
  test(`${course}: selects pilot/cockpit, looks without steering, and keeps the mounted eye under boost`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/?course=${course}`);
    await page.locator('#viewSelect').selectOption('pilot');
    await page.locator('#startButton').click();
    await page.waitForFunction(() => window.EZero.state === 'race');
    await checkMount(page);
    await page.keyboard.down('KeyQ');
    await page.waitForFunction(() => window.EZero.view.lookYaw < -1.4);
    expect(await page.evaluate(() => window.EZero.view.steer)).toBe(0);
    await checkMount(page);
    await page.keyboard.up('KeyQ');
    await page.waitForFunction(() => window.EZero.view.lookYaw === 0);
    const fov = await page.evaluate(() => window.EZero.view.fov);
    await page.keyboard.down('Space');
    await page.waitForFunction(() => window.EZero.stats.boostFX > 0.8);
    // Put actual rivals behind us before braking to test their approach. A short
    // boost tap can leave the entire field ahead, especially on Skyline's wide grid.
    await page.waitForFunction(() => window.EZero.stats.position < 95);
    await checkMount(page);
    expect(await page.evaluate(() => window.EZero.view.fov)).toBe(fov);
    await page.keyboard.up('Space');
    await page.keyboard.press('v');
    await page.waitForFunction(
      () => window.EZero.view.mode === 'cockpit' && window.EZero.view.feeds.frame > 0,
    );
    await checkMount(page);
    await expect(page.locator('.speed-panel')).toBeHidden();
    const frame = await page.evaluate(() => window.EZero.view.feeds.frame);
    await page.keyboard.down('ArrowDown');
    await page.waitForFunction(() =>
      window.EZero.view.contacts.some((c) => c.approaching || c.alongside),
    );
    await page.keyboard.up('ArrowDown');
    await page.waitForFunction((previous) => window.EZero.view.feeds.frame > previous + 2, frame);
    await page.screenshot({ path: testInfo.outputPath(`${course}-cockpit.png`) });
    await page.keyboard.down('KeyE');
    await page.waitForFunction(() => window.EZero.view.lookYaw > 1.4);
    await checkMount(page);
    await page.screenshot({ path: testInfo.outputPath(`${course}-right-window.png`) });
    await page.keyboard.press('Escape');
    await page.keyboard.up('KeyE');
    await page.waitForFunction(() => window.EZero.view.lookYaw === 0);
    await checkMount(page);
    const pausedTime = await page.evaluate(() => window.EZero.stats.time);
    await page.locator('#cameraButton').click();
    await expect(page.locator('#cameraButton')).toHaveAccessibleName(/Camera: Chase/);
    expect(await page.evaluate(() => window.EZero.stats.time)).toBe(pausedTime);
    await page.locator('#cameraButton').click();
    await page.locator('#cameraButton').click();
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('#viewSelect')).toHaveValue('cockpit');
    expect(await page.evaluate(() => window.EZero.view.inside)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('touch glances release on cancellation, blur and resize without resetting the race', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?course=skyline');
  await page.locator('#viewSelect').selectOption('cockpit');
  await page.locator('#startButton').click();
  await page.waitForFunction(() => window.EZero.state === 'race');
  const left = page.getByRole('button', { name: 'Look left (hold Q)', exact: true });
  await expect(left).toBeVisible();
  await left.dispatchEvent('pointerdown', { pointerId: 7 });
  await page.waitForFunction(() => window.EZero.view.lookYaw < -1.4);
  await checkMount(page);
  await left.dispatchEvent('pointercancel', { pointerId: 7 });
  await page.waitForFunction(() => window.EZero.view.lookYaw === 0);
  await page.screenshot({ path: testInfo.outputPath('cockpit-portrait.png') });
  const before = await page.evaluate(() => window.EZero.stats.time);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.EZero.viewport.width === 844);
  await checkMount(page);
  expect(await page.evaluate(() => window.EZero.stats.time)).toBeGreaterThanOrEqual(before);
  await page.screenshot({ path: testInfo.outputPath('cockpit-landscape-touch.png') });
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.EZero.view.lookYaw > 1.4);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.EZero.state)).toBe('paused');
  expect(await page.evaluate(() => window.EZero.view.lookYaw)).toBe(0);
  await page.keyboard.up('KeyE');
});

test('both interior cameras stay attached through the vertical loop and corkscrew', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto('/?course=skyline');
  await page.locator('#viewSelect').selectOption('cockpit');
  await page.locator('#startButton').click();
  await driveCentreLine(page);
  for (const section of ['Vertical loop', 'Corkscrew']) {
    await page.waitForFunction(
      (section) => window.EZero.stats.section === section && window.EZero.stats.up.z < -0.8,
      section,
      { timeout: 90_000 },
    );
    await checkMount(page);
    expect(await page.evaluate(() => window.EZero.view.up.z)).toBeLessThan(-0.7);
    await page.screenshot({ path: testInfo.outputPath(`${section}-cockpit.png`) });
    await page.keyboard.press('v');
    await page.keyboard.press('v');
    await page.waitForFunction(() => window.EZero.view.mode === 'pilot');
    await checkMount(page);
    await page.keyboard.down('KeyQ');
    await page.waitForFunction(() => window.EZero.view.lookYaw < -1.4);
    await checkMount(page);
    await page.keyboard.up('KeyQ');
    await page.keyboard.press('v');
  }
});

test('reduced motion and unavailable WebGL still allow Classic cockpit driving', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      id: string,
      ...args: unknown[]
    ) {
      return id === 'webgl' ? null : Reflect.apply(original, this, [id, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('#courseSelect')).toHaveValue('classic');
  await page.locator('#viewSelect').selectOption('cockpit');
  await page.locator('#startButton').click();
  await page.waitForFunction(() => window.EZero.state === 'race');
  await page.keyboard.down('KeyE');
  await page.waitForFunction(() => window.EZero.view.lookYaw > 1.4);
  await checkMount(page);
  await page.keyboard.up('KeyE');
  await page.waitForFunction(() => window.EZero.view.lookYaw === 0);
  expect(await page.evaluate(() => window.EZero.view.feeds.frame)).toBeGreaterThan(2);
});
