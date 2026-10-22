import { defineConfig, devices } from '@playwright/test';
import { INBOX_PORT, PORT } from './tests/e2e/fixtures';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Service workers stay off in tests: one would answer requests that tests route themselves.
  // tests/e2e/pwa.spec.ts turns them on to test the worker.
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry', serviceWorkers: 'block' },
  // Launch QA matrix (task 2.3.1): Safari's engine on iPhone and iPad, Chrome on Android and two
  // laptop widths, with two of the five in dark mode.
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], colorScheme: 'dark' } },
    { name: 'pixel', use: { ...devices['Pixel 8'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 11)'] } },
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        colorScheme: 'dark',
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // Bhoomi's notifications land here, so tests can follow her approve links.
      command: 'node scripts/e2e-inbox.mjs',
      url: `http://localhost:${INBOX_PORT}`,
      reuseExistingServer: false,
    },
    {
      // --ignore-lock keeps astro preview in the foreground; Astro 7 backgrounds it when an agent
      // runs it. A fresh local database and the local secrets first (scripts/e2e-setup.mjs).
      command: `node scripts/e2e-setup.mjs && npm run build && npm run preview -- --port ${PORT} --ignore-lock`,
      url: `http://localhost:${PORT}`,
      // Never reuse a running server: on a shared machine it may be another project's site.
      // A busy port then fails loudly instead of testing the wrong pages.
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
