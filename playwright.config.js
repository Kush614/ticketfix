import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './app/tests',
  timeout: 20_000,
  retries: 0,
  workers: 1,               // tests share one app server; run them one at a time
  reporter: [['list'], ['json', { outputFile: 'out/last-run.json' }]],
  outputDir: 'out/test-results',
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:4174',
    video: 'on',            // every run is recorded; the pipeline harvests these as before/after
    viewport: { width: 900, height: 640 },
    trace: 'off',
    // the pipeline slows single-spec runs down so the before/after videos are watchable (see runner.js)
    launchOptions: { slowMo: Number(process.env.TICKETFIX_SLOWMO) || 0 },
  },
  // Tests get their own fresh server on :4174 (humans use :4173), so a fix to server code is always what runs.
  webServer: {
    command: 'node app/server.js',
    env: { PORT: '4174' },
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 10_000,
  },
});
