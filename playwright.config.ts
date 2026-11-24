import fs from 'node:fs';
import { defineConfig } from '@playwright/test';

const preinstalledHeadlessShell =
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';

const executablePath =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ||
  (fs.existsSync(preinstalledHeadlessShell)
    ? preinstalledHeadlessShell
    : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    viewport: { width: 1366, height: 860 },
    actionTimeout: 15_000,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
