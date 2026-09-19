import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { driveCentreLine } from './driver';

async function racer(
  browser: Browser,
  baseURL: string,
  name: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ baseURL, viewport: { width: 600, height: 400 } });
  const page = await context.newPage();
  await page.goto('/');
  if (name === 'Ada') await page.locator('#courseSelect').selectOption('classic');
  await page.locator('#onlineButton').click();
  await page.locator('#onlineName').fill(name);
  return { page, context };
}

async function join(page: Page, code: string): Promise<void> {
  await page.locator('#onlineJoinCode').fill(code);
  await page.locator('#onlineJoin').click();
}

test('four real WebRTC peers race, reject a fifth, finish together and rematch', async ({
  browser,
  baseURL,
}) => {
  // The longer Skyline circuit doubles real race duration.
  test.setTimeout(420_000);
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  try {
    const make = async (name: string): Promise<Page> => {
      const r = await racer(browser, baseURL ?? '', name);
      contexts.push(r.context);
      r.page.on('pageerror', (e) => errors.push(e.message));
      return r.page;
    };
    const host = await make('Host');
    await host.locator('#onlineCreate').click();
    await expect(host.locator('#onlineCount')).toHaveText('1 / 4 PLAYERS', { timeout: 20_000 });
    const code = await host.locator('#onlineCode').innerText();
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    await expect(host.locator('#onlineStart')).toBeDisabled();
    const guests: Page[] = [];
    for (const name of ['Ada', 'Bea', 'Cy']) {
      const page = await make(name);
      await join(page, code);
      await expect(page.locator('#onlineReady')).toBeEnabled({ timeout: 20_000 });
      await page.locator('#onlineReady').click();
      guests.push(page);
    }
    const pages = [host, ...guests];
    for (const page of pages)
      await expect(page.locator('#onlineCount')).toHaveText('4 / 4 PLAYERS');
    const fifth = await make('Fifth');
    await join(fifth, code);
    await expect(fifth.locator('#onlineStatus')).toContainText('Room is full', { timeout: 20_000 });
    await host.locator('#onlineStart').click();
    for (const page of pages) {
      await page.waitForFunction(() => window.EZero.state === 'race');
      await expect(page.locator('#fieldSize')).toHaveText('/ 4');
      await page.keyboard.press('Escape');
      await page.keyboard.press('r');
      expect(await page.evaluate(() => window.EZero.state)).toBe('race');
    }
    await join(fifth, code);
    await expect(fifth.locator('#onlineStatus')).toContainText('already started', {
      timeout: 20_000,
    });
    await fifth.close();

    for (const page of pages) {
      expect(await page.evaluate(() => window.EZero.stats.course)).toBe('skyline');
      expect(await page.evaluate(() => window.EZero.course.graphicsReady)).toBe(true);
      await driveCentreLine(page);
    }
    await host.waitForFunction(() => window.EZero.online.racers.every((r) => r.s > 500), null, {
      timeout: 20_000,
    });
    const hostState = await host.evaluate(() => window.EZero.online);
    expect(hostState.craft).toHaveLength(3);
    expect(new Set(hostState.racers.map((r) => r.slot)).size).toBe(4);
    for (const page of guests)
      await page.waitForFunction(() => window.EZero.online.craft.every((c) => c.s > 100));
    await host.waitForFunction(() => window.EZero.online.phase === 'finished', null, {
      timeout: 320_000,
    });
    const expected = await host.evaluate(() =>
      window.EZero.online.racers.map((r) => ({
        id: r.id,
        finishedAt: r.finishedAt,
        failed: r.failed,
      })),
    );
    expect(expected.every((r) => r.finishedAt !== null && !r.failed)).toBe(true);
    for (const page of pages) {
      await expect(page.locator('#onlineHeading')).toHaveText('RACE RESULTS');
      expect(
        await page.evaluate(() =>
          window.EZero.online.racers.map((r) => ({
            id: r.id,
            finishedAt: r.finishedAt,
            failed: r.failed,
          })),
        ),
      ).toEqual(expected);
    }
    await host.locator('#onlineRematch').click();
    for (const page of guests) {
      await expect(page.locator('#onlineReady')).toBeVisible();
      await page.locator('#onlineReady').click();
    }
    await host.locator('#onlineStart').click();
    for (const page of pages)
      await page.waitForFunction(
        () => window.EZero.online.round === 2 && window.EZero.state === 'race',
      );
    await guests[2].close();
    await host.waitForFunction(() =>
      window.EZero.online.racers.some((r) => r.name === 'Cy' && !r.connected),
    );
    await host.close();
    for (const page of guests.slice(0, 2)) {
      await expect(page.locator('#onlineStatus')).toContainText('host disconnected', {
        timeout: 20_000,
      });
      await page.locator('#onlineBack').click();
      await page.locator('#startButton').click();
      await page.waitForFunction(() => window.EZero.state === 'race');
      expect(await page.evaluate(() => window.EZero.stats.fieldSize)).toBe(100);
    }
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('invalid codes, invite links, leaving the lobby and missing rooms recover cleanly', async ({
  browser,
  baseURL,
}) => {
  const { page, context } = await racer(browser, baseURL ?? '', 'Racer');
  try {
    await join(page, 'bad');
    await expect(page.locator('#onlineStatus')).toHaveText('Enter an 8-character room code.');
    await page.goto('/?room=ABCDEFGH');
    await expect(page.locator('#onlineJoinCode')).toHaveValue('ABCDEFGH');
    await page.locator('#onlineJoin').click();
    await expect(page.locator('#onlineStatus')).toContainText(
      /Room not found|Connection timed out/,
      { timeout: 20_000 },
    );
    await page.locator('#onlineCreate').click();
    await expect(page.locator('#onlineCount')).toHaveText('1 / 4 PLAYERS', { timeout: 20_000 });
    await page.locator('#onlineLeave').click();
    await expect(page.locator('#onlineSetup')).toBeVisible();
    await page.locator('#onlineBack').click();
    await expect(page.locator('#startButton')).toBeVisible();
  } finally {
    await context.close();
  }
});
