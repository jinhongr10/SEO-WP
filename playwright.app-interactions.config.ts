import { defineConfig } from '@playwright/test';

const testServerUrl = 'http://127.0.0.1:3103';

export default defineConfig({
  testDir: './tests/app-interactions',
  testMatch: '**/*.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/app-interactions',
  reporter: 'line',
  use: {
    baseURL: testServerUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Use node + vite.js (not npm) so Windows paths containing "&" do not break .bin shims.
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3103',
    url: `${testServerUrl}/tests/app-interactions/harness.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
