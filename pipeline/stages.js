import fs from 'node:fs';
import path from 'node:path';
import { ask, parseJson, uploadVideo } from './gemini.js';
import { snapshot, applyWrites, gitDiff } from './repo.js';
import { runPlaywright } from './runner.js';
import * as P from './prompts.js';

const MAX_TRIES = Number(process.env.TICKETFIX_MAX_TRIES || 3);

export async function analyze({ root, videoPart, log }) {
  log('👁  Argon is watching the recording and reading the repo…');
  const text = await ask({
    system: P.SYSTEM,
    parts: [videoPart, { text: P.ANALYZE }, { text: snapshot(root) }],
    json: true,
    mockKey: 'analyze',
  });
  const bug = parseJson(text);
  log(`   → ${bug.title}  (confidence ${bug.confidence})`);
  return bug;
}

export async function reproduce({ root, videoPart, bug, ticketId, log }) {
  const specRel = `app/tests/ticket-${ticketId}.spec.js`;
  let extra = [];
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    log(`🧪 Writing reproduction test (attempt ${attempt}/${MAX_TRIES})…`);
    const text = await ask({
      system: P.SYSTEM,
      parts: [videoPart, { text: P.REPRODUCE(bug, specRel) }, ...extra, { text: snapshot(root) }],
      json: true,
      mockKey: 'reproduce',
    });
    const spec = parseJson(text);
    applyWrites(root, [{ path: specRel, content: spec.content }]);

    const run = runPlaywright(root, specRel, { label: 'before' });
    if (!run.passed) {
      log(`   ✓ test FAILS on current code (good) — ${spec.what_it_asserts}`);
      return { specRel, spec: spec.content, beforeVideo: run.videos[0], output: run.output };
    }
    log('   ✗ test passed on buggy code — not a reproduction, retrying');
    extra = [{ text: P.REPRODUCE_RETRY(run.output) }];
  }
  throw new Error('could not write a failing reproduction test');
}

export async function fix({ root, bug, specRel, spec, log }) {
  let extra = [];
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    log(`🔧 Writing fix (attempt ${attempt}/${MAX_TRIES})…`);
    const text = await ask({
      system: P.SYSTEM,
      parts: [{ text: P.FIX(bug, spec) }, ...extra, { text: snapshot(root) }],
      json: true,
      mockKey: 'fix',
    });
    const res = parseJson(text);
    const touched = res.files.filter(f => f.path.startsWith('app/') && !f.path.startsWith('app/tests/'));
    if (touched.length !== res.files.length) log('   ! dropped edits outside app/ or inside tests/');
    applyWrites(root, touched, { allowNew: false });
    log(`   edited: ${touched.map(f => f.path).join(', ')}`);

    // 1) the repro test must now pass; 2) the whole suite must still pass
    const one = runPlaywright(root, specRel, { label: 'after' });
    if (one.passed) {
      const all = runPlaywright(root, undefined, { label: 'suite' });
      if (all.passed) {
        log('   ✓ repro test passes, full suite green');
        // re-run the single spec last so out/videos/after-1.webm is the clean "after" recording
        const again = runPlaywright(root, specRel, { label: 'after' });
        return { rationale: res.rationale, diff: gitDiff(root), afterVideo: again.videos[0] };
      }
      log('   ✗ repro passes but suite regressed — retrying');
      extra = [{ text: P.FIX_RETRY(all.output) }];
    } else {
      log('   ✗ repro test still fails — retrying');
      extra = [{ text: P.FIX_RETRY(one.output) }];
    }
  }
  throw new Error('could not produce a passing fix');
}

export async function verify({ bug, originalVideoPart, afterVideoPath, diff, log }) {
  log('🎬 Argon is watching the after-video and comparing it to the ticket…');
  const afterPart = await uploadVideo(afterVideoPath);
  const text = await ask({
    system: P.SYSTEM,
    parts: [
      { text: 'ORIGINAL customer recording:' }, originalVideoPart,
      { text: 'NEW recording of the test on the fixed build:' }, afterPart,
      { text: P.VERIFY(bug) },
      { text: `Code diff:\n\`\`\`diff\n${diff}\n\`\`\`` },
    ],
    json: true,
    mockKey: 'verify',
  });
  const v = parseJson(text);
  log(`   → verdict: ${v.verdict}`);
  return v;
}
