import { resolve } from 'node:path';

import { defineConfig } from '@playwright/test';

const harnessRoot = process.env.PHASE_HARNESS_ROOT
  ? resolve(process.env.PHASE_HARNESS_ROOT)
  : resolve(import.meta.dirname, '../apps/harness');
const port = 4173;

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    contextOptions: { reducedMotion: 'no-preference' },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --dir ${JSON.stringify(harnessRoot)} start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
