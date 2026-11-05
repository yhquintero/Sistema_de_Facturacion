import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },
  webServer: [
    { command: 'node --import tsx tests/e2e-server.ts', url: 'http://127.0.0.1:3100/api/health', timeout: 60_000, reuseExistingServer: false },
    { command: 'node --import tsx tests/e2e-server.ts --protected --production', url: 'http://127.0.0.1:3101/api/health', timeout: 60_000, reuseExistingServer: false },
  ],
});
