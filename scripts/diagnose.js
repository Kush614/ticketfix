// Diagnosis-only TicketFix run on an external codebase: watch the bug video(s), read the code, report the
// root cause and propose a fix. No test harness here, so there is no reproduce/verify loop.
//   node --env-file=.env scripts/diagnose.js <srcRoot> <outDir> <video> [video…] [--note "customer's words"]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { uploadVideo, ask, parseJson, MODEL } from '../pipeline/gemini.js';
import * as P from '../pipeline/prompts.js';

const argv = process.argv.slice(2);
const noteAt = argv.indexOf('--note');
const note = noteAt >= 0 ? argv.splice(noteAt, 2)[1] : '';
const [srcRoot, outDir, ...videos] = argv;
if (!srcRoot || !outDir || !videos.length) {
  console.error('usage: node --env-file=.env scripts/diagnose.js <srcRoot> <outDir> <video> [video…] [--note "…"]');
  process.exit(1);
}
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);

// source files only: no tests, no test harness helpers
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'testing'].includes(e.name)) walk(p); }
    else if (/\.(ts|tsx|js|jsx|scss|css|html)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) files.push(p);
  }
})(srcRoot);
files.sort();
let snap = `<repo files="${files.length}">\n`;
for (const f of files) snap += `\n<file path="${path.relative(srcRoot, f)}">\n${fs.readFileSync(f, 'utf8')}\n</file>\n`;
snap += '</repo>\n';

log(`🎫 ${files.length} source files (${(snap.length / 1e3).toFixed(0)} KB), ${videos.length} video(s)  model=${MODEL}`);
if (note) log(`💬 reporter wrote: "${note}"`);
const parts = [];
for (const v of videos) parts.push(await uploadVideo(v));

log('👁  Argon is watching the recording(s) and reading the code…');
const bug = parseJson(await ask({
  system: P.SYSTEM,
  parts: [...parts, ...(note ? [{ text: P.CUSTOMER_NOTE(note) }] : []), { text: P.ANALYZE }, { text: snap }],
  json: true, think: true, mockKey: 'analyze',
}));
log(`   → ${bug.title}  (confidence ${bug.confidence})`);
log(`   suspected: ${bug.suspected_files.join(', ')}`);

log('🔧 Proposing a fix…');
const fix = parseJson(await ask({ system: P.SYSTEM, parts: [{ text: P.EXTERNAL_FIX(bug) }, { text: snap }], json: true, mockKey: 'fix' }));

// turn the full-file rewrites into a reviewable diff against the original sources
fs.mkdirSync(outDir, { recursive: true });
let diff = '';
const unchanged = [];
for (const f of fix.files) {
  const orig = path.join(srcRoot, f.path);
  if (!fs.existsSync(orig)) { diff += `# (new file proposed: ${f.path})\n`; continue; }
  // the model sometimes describes an edit it did not make: say so instead of trusting the rationale
  if (fs.readFileSync(orig, 'utf8') === f.content) { unchanged.push(f.path); continue; }
  const tmp = path.join(outDir, 'proposed', f.path);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, f.content);
  try { execSync(`git diff --no-index -- "${orig}" "${tmp}"`, { encoding: 'utf8' }); }
  catch (e) { diff += (e.stdout || '').replaceAll(srcRoot.replace(/\/$/, '') + '/', '').replaceAll(path.join(outDir, 'proposed') + '/', ''); }
}
fs.writeFileSync(path.join(outDir, 'proposed.diff'), diff);
fs.writeFileSync(path.join(outDir, 'diagnosis.json'), JSON.stringify({ note, bug, rationale: fix.rationale, how_to_verify: fix.how_to_verify, files: fix.files.map(f => f.path), unchanged_but_claimed: unchanged, seconds: (Date.now() - t0) / 1000 }, null, 2));
log(`   edited: ${fix.files.map(f => f.path).filter(p => !unchanged.includes(p)).join(', ') || '(nothing)'}`);
if (unchanged.length) log(`   ⚠️  returned UNCHANGED although listed as edited: ${unchanged.join(', ')} — don't trust the rationale for these`);
log(`📦 wrote ${outDir}/{diagnosis.json,proposed.diff}`);
