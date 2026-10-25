// Records a sample customer ticket against the running app, the way a customer would screen-record it.
//   node scripts/record-ticket.js [delete|persist|mobile]   (default: delete)
// Writes tickets/<ticket>.webm, plus tickets/<ticket>.txt with the customer's one-line message when there is one.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://localhost:4173';

async function add(page, titles) {
  for (const t of titles) {
    await page.getByPlaceholder('What needs doing?').fill(t);
    await page.getByRole('button', { name: 'Add' }).click();
  }
}

const SCENARIOS = {
  // front-end logic: deleting under the Active filter removes a different todo
  delete: {
    ticket: 'ticket-001',
    viewport: { width: 900, height: 640 },
    async steps(page) {
      await add(page, ['Buy milk', 'Walk dog', 'Pay rent']);
      await page.getByLabel('Mark Buy milk done').click();
      await page.getByRole('button', { name: 'Active' }).click();
      await sleep(1000);
      await page.getByLabel('Delete Pay rent').click();
      await sleep(1500);
      await page.getByRole('button', { name: 'All' }).click();
      await sleep(2000);
    },
  },
  // back-end logic: ticks are never saved, so they vanish on reload
  persist: {
    ticket: 'ticket-persist',
    note: "I tick things off, refresh the page, and they're all unticked again. Every time.",
    viewport: { width: 900, height: 640 },
    async steps(page) {
      await add(page, ['Buy milk', 'Walk dog', 'Pay rent']);
      await page.getByLabel('Mark Buy milk done').click();
      await page.getByLabel('Mark Pay rent done').click();
      await sleep(2000);
      await page.reload();
      await sleep(2500);
      await page.reload();
      await sleep(2500);
    },
  },
  // layout: on a phone a long title pushes the delete button out of the row
  mobile: {
    ticket: 'ticket-mobile',
    note: "On my phone I can't delete the long task — there's no delete button on it.",
    viewport: { width: 390, height: 740 },
    async steps(page) {
      await add(page, ['Buy milk', 'Call the landlord about the broken heating in the upstairs bathroom']);
      await sleep(1200);
      await page.getByText('Call the landlord').click();
      await sleep(1500);
      await page.getByLabel('Delete Buy milk').click();
      await sleep(2500);
    },
  },
};

const scenario = SCENARIOS[process.argv[2] || 'delete'];
if (!scenario) { console.error(`scenarios: ${Object.keys(SCENARIOS).join(', ')}`); process.exit(1); }
const out = path.join(root, 'tickets', `${scenario.ticket}.webm`);
const tmp = path.join(root, 'out', 'record-tmp');

const server = spawn('node', ['app/server.js'], { cwd: root, stdio: 'ignore', env: { ...process.env, PORT: '4173' } });
await sleep(800);
const browser = await chromium.launch({ slowMo: 600 });
try {
  const ctx = await browser.newContext({ viewport: scenario.viewport, recordVideo: { dir: tmp, size: scenario.viewport } });
  const page = await ctx.newPage();
  await page.request.post(`${URL}/api/reset`);
  await page.goto(URL);
  await scenario.steps(page);

  const video = page.video();
  await ctx.close();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(await video.path(), out);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (scenario.note) fs.writeFileSync(out.replace(/\.webm$/, '.txt'), scenario.note + '\n');
  console.log(`recorded ${path.relative(root, out)}`);
} finally {
  await browser.close();
  server.kill();
}
