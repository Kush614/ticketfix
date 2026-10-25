// Records the sample customer ticket: the 5 steps from SPEC §5, saved as tickets/ticket-001.webm.
//   node scripts/record-ticket.js [out.webm]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'tickets', 'ticket-001.webm'));
const tmp = path.join(root, 'out', 'record-tmp');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('node', ['app/server.js'], { cwd: root, stdio: 'ignore' });
await sleep(800);
const browser = await chromium.launch({ slowMo: 600 });
try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 }, recordVideo: { dir: tmp, size: { width: 900, height: 640 } } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  for (const t of ['Buy milk', 'Walk dog', 'Pay rent']) {
    await page.getByPlaceholder('What needs doing?').fill(t);
    await page.getByRole('button', { name: 'Add' }).click();
  }
  await page.getByLabel('Mark Buy milk done').click();
  await page.getByRole('button', { name: 'Active' }).click();
  await sleep(1000);
  await page.getByLabel('Delete Pay rent').click();   // bug: Walk dog disappears instead
  await sleep(1500);
  await page.getByRole('button', { name: 'All' }).click();
  await sleep(2000);

  const video = page.video();
  await ctx.close();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(await video.path(), out);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`recorded ${path.relative(root, out)}`);
} finally {
  await browser.close();
  server.kill();
}
