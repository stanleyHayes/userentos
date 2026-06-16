import { defineConfig, devices } from '@playwright/test'

/**
 * RentOS end-to-end Playwright configuration.
 *
 * The webServer block spawns the root `npm run e2e:dev` script which starts
 * both the Vite client (dedicated port 5174 to avoid collisions with other
 * Vite projects) and the Express API server (port 3002). The server seeds the
 * e2e database on first boot, so tests can assume the standard demo accounts
 * (e.g. `kwame@rentos.gh / password123`) exist.
 *
 * `PLAYWRIGHT_REUSE_SERVER=1` lets an externally-started server be reused
 * (used by `npm run test:local` which auto-detects the port via detect-port.js).
 * By default Playwright always starts a fresh isolated dev server for you.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['html', { open: 'never' }], ['list']],

  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${process.env.DEV_CLIENT_PORT || '5174'}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Run from the monorepo root; this script boots both the Vite client and
    // the Express API via concurrently, using the e2e database and a dedicated
    // client port (5174) to avoid collisions with other Vite dev servers.
    command: 'cd .. && DEV_CLIENT_PORT=5174 npm run e2e:dev',
    url: `http://localhost:${process.env.DEV_CLIENT_PORT || '5174'}`,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
