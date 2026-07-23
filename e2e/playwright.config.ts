import { defineConfig, devices } from '@playwright/test';

const frontendPort = process.env.E2E_FRONTEND_PORT ?? '5173';
const backendPort = process.env.E2E_BACKEND_PORT ?? '3099';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;

// When unset (e.g. in CI), Playwright's bundled Chromium is used.
// On WSL/Linux desktops without the bundled browser, set
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}),
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start:e2e',
      cwd: '../backend',
      url: `http://127.0.0.1:${backendPort}/api/e2e/health`,
      reuseExistingServer: process.env.PW_REUSE_FRESH !== '1' && !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        E2E_BACKEND_PORT: backendPort,
        E2E_MODE: 'true',
      },
    },
    {
      command: `npm run dev -- --port ${frontendPort} --strictPort --host 127.0.0.1`,
      cwd: '../frontend',
      url: baseURL,
      reuseExistingServer: process.env.PW_REUSE_FRESH !== '1' && !process.env.CI,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        VITE_E2E_USE_API: 'true',
        E2E_BACKEND_PORT: backendPort,
        VITE_REACT_APP_API_BASE_URL: '',
        VITE_REACT_APP_WEBSOCKET_URL: `http://127.0.0.1:${backendPort}`,
      },
    },
  ],
});
