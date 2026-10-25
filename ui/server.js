// TicketFix Studio: one server for the whole demo.
//   npm start   → http://localhost:4180
// Runs Taskly (the app under repair) on :4173 as a child process, embeds it in the page, takes a bug
// recording + customer note, runs the pipeline with the log streamed live, and restarts Taskly afterwards
// so the fixed build (front end and back end) is what you click around in.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PORT = 4173;
const app = express();
let busy = false;

// ---- Taskly child process -------------------------------------------------------------------
let taskly = null;
let tasklyError = '';
function startTaskly() {
  return new Promise(resolve => {
    tasklyError = '';
    const child = spawn('node', ['app/server.js'], { cwd: root, env: { ...process.env, PORT: String(APP_PORT) } });
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    child.stdout.on('data', d => { if (String(d).includes('Taskly on')) finish(); });
    child.stderr.on('data', d => { tasklyError += d; if (/EADDRINUSE/.test(tasklyError)) tasklyError = `port ${APP_PORT} is already in use (stop \`npm run app\`)`; });
    child.on('exit', () => { if (taskly === child) taskly = null; finish(); });
    taskly = child;
    setTimeout(finish, 3000);
  });
}
async function restartTaskly() {
  if (taskly) {
    const old = taskly;
    taskly = null;
    await new Promise(r => { old.once('exit', r); old.kill(); });
  }
  await startTaskly();
}
const appChanged = () => { try { return execSync('git status --porcelain app', { cwd: root, encoding: 'utf8' }).trim() !== ''; } catch { return false; } };
function resetApp() { spawnSync('npm', ['run', 'reset'], { cwd: root }); }

// ---- routes ---------------------------------------------------------------------------------
app.get('/', (_req, res) => res.sendFile(path.join(root, 'ui', 'index.html')));
app.use('/out', express.static(path.join(root, 'out')));
app.use('/tickets', express.static(path.join(root, 'tickets')));

app.get('/state', (_req, res) => {
  res.json({
    appUrl: `http://localhost:${APP_PORT}`,
    appRunning: !!taskly,
    appError: tasklyError,
    appFixed: appChanged(),
    busy,
    tickets: fs.readdirSync(path.join(root, 'tickets')).filter(f => /\.(webm|mp4|mov)$/.test(f)),
    real: fs.existsSync(path.join(root, '.env')),
  });
});

app.post('/reset', async (_req, res) => {
  if (busy) return res.status(409).send('a run is in progress');
  resetApp();
  await restartTaskly();
  res.json({ ok: true });
});

// POST /run?name=<file>&mode=mock|real&pr=0|1&note=<text>   body: the video bytes (omit to re-run an existing ticket)
app.post('/run', express.raw({ type: '*/*', limit: '500mb' }), async (req, res) => {
  if (busy) return res.status(409).send('a run is already in progress');
  const name = path.basename(String(req.query.name || ''));
  if (!/^[\w.-]+\.(webm|mp4|mov)$/.test(name)) return res.status(400).send('need a .webm, .mp4 or .mov file name');
  const ticket = path.join(root, 'tickets', name);
  if (req.body?.length) fs.writeFileSync(ticket, req.body);
  if (!fs.existsSync(ticket)) return res.status(404).send(`no such ticket: ${name}`);
  const note = String(req.query.note || '').trim().slice(0, 500);
  if (note) fs.writeFileSync(ticket.replace(/\.[^.]+$/, '.txt'), note + '\n');

  const real = req.query.mode === 'real' && fs.existsSync(path.join(root, '.env'));
  const args = [...(real ? ['--env-file=.env'] : []), 'pipeline/index.js', `tickets/${name}`, ...(real ? [] : ['--mock']), ...(req.query.pr === '1' ? [] : ['--no-pr'])];

  busy = true;
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  const send = s => res.write(s.replace(/\b(AQ\.|AIza)[\w-]+/g, '***'));  // never let a key reach the page
  send(`$ npm run reset && node ${args.filter(a => !a.startsWith('--env')).join(' ')}${real ? '' : '   (mock mode)'}\n`);
  resetApp();
  await restartTaskly();

  const child = spawn('node', args, { cwd: root });
  child.stdout.on('data', d => send(d.toString()));
  child.stderr.on('data', d => send(d.toString()));
  child.on('close', async code => {
    await restartTaskly();  // serve the fixed build (server.js changes need a restart)
    busy = false;
    send(`\n[exit ${code}]${appChanged() ? '  · Taskly is now running the FIXED build — try it, then Reset' : ''}\n`);
    res.end();
  });
  // a closed tab doesn't kill the run: the pipeline must not be left half-applied
});

const PORT = process.env.UI_PORT || 4180;
await startTaskly();
if (tasklyError) console.warn(`! Taskly did not start: ${tasklyError}`);
const server = app.listen(PORT, '127.0.0.1', () => console.log(`TicketFix Studio on http://localhost:${PORT}  (Taskly on :${APP_PORT})`));
const stop = () => { taskly?.kill(); server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
