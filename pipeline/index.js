#!/usr/bin/env node
// TicketFix: screen recording in → PR with failing test, fix, and before/after video out.
//
//   node pipeline/index.js tickets/<ticket>.mp4 [--mock] [--no-pr]
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uploadVideo, isMock, MODEL } from './gemini.js';
import { analyze, reproduce, fix, verify } from './stages.js';
import { openPr } from './pr.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter(a => a.startsWith('--')));

const videoPath = args[0] ? path.resolve(args[0]) : null;
if (!videoPath || !fs.existsSync(videoPath)) {
  console.error('usage: node pipeline/index.js <recording.mp4|webm> [--mock] [--no-pr]');
  process.exit(1);
}

const ticketId = path.basename(videoPath).replace(/\.[^.]+$/, '');
const t0 = Date.now();
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
const stageLog = [];
const logged = m => { log(m); stageLog.push(m); };

try {
  logged(`🎫 ${ticketId}  model=${MODEL}${isMock ? '  (MOCK MODE)' : ''}`);
  const videoPart = await uploadVideo(videoPath);
  // optional customer message next to the video: tickets/<id>.txt
  const notePath = videoPath.replace(/\.[^.]+$/, '.txt');
  const note = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8').trim() : '';
  if (note) logged(`💬 customer wrote: "${note}"`);

  const bug = await analyze({ root, videoPart, note, log: logged });
  const rep = await reproduce({ root, videoPart, bug, ticketId, log: logged });
  let fx = await fix({ root, bug, specRel: rep.specRel, spec: rep.spec, log: logged });
  let verdict = await verify({ bug, originalVideoPart: videoPart, afterVideoPath: fx.afterVideo, diff: fx.diff, log: logged });

  // The reviewer watched the fix and rejected it: one more fix pass with its critique, then re-verify.
  if (verdict.verdict === 'not_fixed') {
    logged('🔁 Verifier rejected the fix — sending its critique back to the fixer');
    fx = await fix({ root, bug, specRel: rep.specRel, spec: rep.spec, feedback: verdict.comparison, log: logged });
    verdict = await verify({ bug, originalVideoPart: videoPart, afterVideoPath: fx.afterVideo, diff: fx.diff, log: logged });
  }

  if (verdict.verdict !== 'fixed') {
    logged(`⚠️  verifier says "${verdict.verdict}" — not opening a PR. See out/pr/${ticketId}/PR.md`);
  }
  const pr = openPr({
    root, ticketId, bug, verdict, diff: fx.diff, specRel: rep.specRel,
    beforeVideo: rep.beforeVideo, afterVideo: fx.afterVideo, log: logged,
    dryRun: flags.has('--no-pr') || isMock || verdict.verdict !== 'fixed',
  });

  fs.writeFileSync(path.join(pr.outDir, 'run.json'), JSON.stringify({ ticketId, bug, verdict, rationale: fx.rationale, prUrl: pr.url, log: stageLog, seconds: (Date.now() - t0) / 1000 }, null, 2));
  logged(`✅ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) {
  log(`💥 ${e.message}`);
  process.exit(2);
}
