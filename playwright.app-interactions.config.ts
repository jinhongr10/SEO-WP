import { defineConfig } from '@playwright/test';

const testServerUrl = 'http://127.0.0.1:3103';

export default defineConfig({
  testDir: './tests/app-interactions',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/app-interactions',
  reporter: 'line',
  use: {
    baseURL: testServerUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev:frontend -- --host 127.0.0.1 --port 3103',
    url: `${testServerUrl}/tests/app-interactions/harness.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
