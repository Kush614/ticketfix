// Runs Playwright and harvests results + the recorded video for a given spec.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Run a spec (or the whole suite when spec is undefined).
 * Returns { passed, output, results, videos: [absPath] }.
 */
export function runPlaywright(root, spec, { label = 'run' } = {}) {
  const outDir = path.join(root, 'out', 'test-results');
  fs.rmSync(outDir, { recursive: true, force: true });
  const args = ['playwright', 'test', ...(spec ? [spec] : []), '--reporter=list,json'];
  const r = spawnSync('npx', args, {
    cwd: root,
    encoding: 'utf8',
    // single-spec runs are the recorded before/after videos the verifier watches: at full speed they are ~1s long
    env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: 'out/last-run.json', CI: '1', TICKETFIX_SLOWMO: spec ? (process.env.TICKETFIX_SLOWMO || '500') : '0' },
  });
  const output = (r.stdout || '') + (r.stderr || '');
  let results = null;
  try { results = JSON.parse(fs.readFileSync(path.join(root, 'out', 'last-run.json'), 'utf8')); } catch {}

  // harvest videos, renamed so they survive the next run
  const videos = [];
  const keep = path.join(root, 'out', 'videos');
  fs.mkdirSync(keep, { recursive: true });
  if (fs.existsSync(outDir)) {
    (function walk(d) {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name.endsWith('.webm')) {
          const dest = path.join(keep, `${label}-${videos.length + 1}.webm`);
          fs.copyFileSync(p, dest);
          videos.push(dest);
        }
      }
    })(outDir);
  }

  return { passed: r.status === 0, output: trimOutput(output), results, videos };
}

function trimOutput(s, max = 6000) {
  // strip ANSI, keep head+tail so the model sees the assertion and the summary
  s = s.replace(/\x1b\[[0-9;]*m/g, '');
  if (s.length <= max) return s;
  return s.slice(0, max / 2) + '\n...[truncated]...\n' + s.slice(-max / 2);
}
