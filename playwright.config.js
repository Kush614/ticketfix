import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './app/tests',
  timeout: 20_000,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'out/last-run.json' }]],
  outputDir: 'out/test-results',
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:4173',
    video: 'on',            // every run is recorded; the pipeline harvests these as before/after
    viewport: { width: 900, height: 640 },
    trace: 'off',
  },
  webServer: {
    command: 'node app/server.js',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
