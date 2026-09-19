import { defineConfig, devices } from '@playwright/test';

const PORT = 4318;
const publicPeer = !!process.env.E_ZERO_PUBLIC_PEER;
const remoteUrl = process.env.E_ZERO_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  use: {
    baseURL: remoteUrl || `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Deterministic frames and no audio hardware dependency in CI.
          args: [
            '--autoplay-policy=no-user-gesture-required',
            '--mute-audio',
            '--disable-lcd-text',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
          ],
        },
      },
    },
  ],
  webServer: remoteUrl
    ? undefined
    : [
        {
          command: 'pnpm build && pnpm preview',
          url: `http://localhost:${PORT}`,
          reuseExistingServer: false,
          env: { VITE_PEER_SERVER: publicPeer ? '' : 'http://127.0.0.1:5320' },
          timeout: 180_000,
        },
        ...(publicPeer
          ? []
          : [
              {
                command: 'pnpm exec peerjs --host 127.0.0.1 --port 5320',
                url: 'http://127.0.0.1:5320',
                reuseExistingServer: false,
                timeout: 30_000,
              },
            ]),
      ],
});
