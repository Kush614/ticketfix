// TicketFix web UI: drop a recording, watch the pipeline log stream, see before/after + the PR.
//   npm run ui   → http://localhost:4180
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
let busy = false;

app.get('/', (_req, res) => res.sendFile(path.join(root, 'ui', 'index.html')));
app.use('/out', express.static(path.join(root, 'out')));
app.use('/tickets', express.static(path.join(root, 'tickets')));

app.get('/tickets.json', (_req, res) => {
  res.json(fs.readdirSync(path.join(root, 'tickets')).filter(f => /\.(webm|mp4)$/.test(f)));
});

// POST /run?name=<file>&mode=mock|real&pr=0|1  body: the video bytes (omit body to re-run an existing ticket)
app.post('/run', express.raw({ type: '*/*', limit: '500mb' }), (req, res) => {
  if (busy) return res.status(409).send('a run is already in progress');
  const name = path.basename(String(req.query.name || ''));
  if (!/^[\w.-]+\.(webm|mp4)$/.test(name)) return res.status(400).send('need a .webm or .mp4 file name');
  const ticket = path.join(root, 'tickets', name);
  if (req.body?.length) fs.writeFileSync(ticket, req.body);
  if (!fs.existsSync(ticket)) return res.status(404).send(`no such ticket: ${name}`);

  const real = req.query.mode === 'real' && fs.existsSync(path.join(root, '.env'));
  const args = [...(real ? ['--env-file=.env'] : []), 'pipeline/index.js', `tickets/${name}`, ...(real ? [] : ['--mock']), ...(req.query.pr === '1' ? [] : ['--no-pr'])];

  busy = true;
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  const send = s => res.write(s.replace(/\b(AQ\.|AIza)[\w-]+/g, '***'));  // never let a key reach the page
  send(`$ npm run reset && node ${args.filter(a => !a.startsWith('--env')).join(' ')}${real ? '' : '   (mock mode)'}\n`);
  spawnSync('npm', ['run', 'reset'], { cwd: root });

  const child = spawn('node', args, { cwd: root });
  child.stdout.on('data', d => send(d.toString()));
  child.stderr.on('data', d => send(d.toString()));
  child.on('close', code => { busy = false; send(`\n[exit ${code}]\n`); res.end(); });
  // a closed tab doesn't kill the run: the pipeline must not be left half-applied
});

const PORT = process.env.UI_PORT || 4180;
app.listen(PORT, '127.0.0.1', () => console.log(`TicketFix UI on http://localhost:${PORT}`));
