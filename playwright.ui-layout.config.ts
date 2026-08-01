import { defineConfig } from '@playwright/test';

const testServerUrl = 'http://127.0.0.1:3103';

export default defineConfig({
  testDir: './tests/ui-layout',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: 'test-results/ui-layout',
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'line',
  use: {
    baseURL: testServerUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Use node + vite.js (not npm) so Windows paths containing "&" do not break .bin shims.
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3103',
    url: `${testServerUrl}/tests/ui-layout/harness.html`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
