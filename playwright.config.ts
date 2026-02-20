import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Skylight Calendar Card e2e tests.
 *
 * Expects Home Assistant to be running at http://localhost:8123.
 * Start it with: docker compose up -d && npm run build
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:8123',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Ignore HTTPS errors when running locally
    ignoreHTTPSErrors: true,
    // Larger viewport to display the calendar fully
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    // Setup project: run onboarding once, save auth state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Main tests use the auth state saved by setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/.auth.json',
      },
      dependencies: ['setup'],
    },
  ],
});
