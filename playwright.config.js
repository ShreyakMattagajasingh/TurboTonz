import { defineConfig } from '@playwright/test';

const executablePath = process.env.PW_CHROME || undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 150_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5190',
    viewport: { width: 1280, height: 720 },
    launchOptions: { executablePath, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] },
    screenshot: 'only-on-failure',
  },
  webServer: { command: 'npx vite --port 5190 --strictPort', url: 'http://localhost:5190', reuseExistingServer: true, timeout: 60_000 },
});
