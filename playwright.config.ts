import './scripts/qa-paths.mjs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    actionTimeout: 20000,
    navigationTimeout: 30000,
    baseURL: process.env.E2E_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  outputDir: 'test-results',
});
