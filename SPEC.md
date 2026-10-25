# TicketFix — Build Spec

> **Read this whole file before touching code.** It is the single source of truth for what we are building, how each stage must behave, and what "done" means. Current time of writing: Sun Oct 25 2026, ~12:30 PM PT. Submissions due **5:00 PM PT**. Everything in here is scoped to be demoable by **4:30 PM**.

---

## 0. One-paragraph pitch

**Support engineers get "it's broken" tickets with a screen recording attached and no repro steps.** TicketFix takes that recording plus the entire codebase, has Gemini 4 Argon *watch the video and read every file*, writes a failing Playwright test that reproduces exactly what the customer did, fixes the bug, re-runs the test with recording on, has Argon *watch its own after-video* and compare it to the customer's, and only then opens a PR with the test, the fix, and before/after videos. Input: a Loom. Output: a reviewable PR with proof.

**Hackathon track:** Problem Statement Two ("More Dimensions" — long video understanding + a render/watch/critique/fix loop). It also leans on Track One (whole-repo context, long structured output).

**Judging alignment** (from the participant guide):
| Criterion | Weight | How TicketFix hits it |
|---|---|---|
| Working live demo w/ real verification loop | 50% | Judge records a bug live → pipeline runs on stage → test fails → fix → test passes → Argon's verdict → PR. Every step is a real check against reality. |
| Concrete problem for a specific person | 25% | The support engineer. Pain is universal and obvious. |
| Only possible with Argon | 15% | Watches a multi-minute video *and* holds the whole repo in one context *and* emits full-file rewrites. Then watches a second video to verify. |
| Clarity of pitch, no slides | 10% | The terminal log + the PR page *is* the pitch. |

---

## 1. Current state of the repo

Already written (do not rewrite from scratch; extend and fix):

```
ticketfix/
├── package.json                 # ESM, scripts: app / test:app / fix / fix:mock
├── playwright.config.js         # testDir app/tests, video:'on', webServer boots app on :4173
├── app/                         # DEMO TARGET APP ("Taskly") — a tiny todo list with a planted bug
│   ├── server.js                # express static server, port 4173
│   ├── public/index.html        # UI: add form, All/Active/Done filters, list
│   ├── public/app.js            # ⚠ PLANTED BUG: deleteTodo(index) splices the UNFILTERED array
│   │                            #   using the FILTERED index → deleting under Active/Done removes
│   │                            #   the wrong item. Fix = key by id (like toggleTodo already does).
│   └── tests/smoke.spec.js      # passing baseline test
├── pipeline/
│   ├── index.js                 # CLI entry: node pipeline/index.js tickets/<id>.mp4 [--mock] [--no-pr]
│   ├── gemini.js                # @google/genai wrapper: uploadVideo(), ask(), parseJson(), mock mode
│   ├── repo.js                  # snapshot(root) → whole-repo string; applyWrites(); git helpers
│   ├── runner.js                # runPlaywright(root, spec, {label}) → {passed, output, videos[]}
│   ├── prompts.js               # SYSTEM, ANALYZE, REPRODUCE(+RETRY), FIX(+RETRY), VERIFY
│   ├── stages.js                # analyze / reproduce / fix / verify — each a retry loop
│   ├── pr.js                    # writes out/pr/<id>/{PR.md,fix.diff,before.webm,after.webm}; gh pr create
│   └── mock/                    # canned model responses so the harness runs with no API key
│       ├── analyze.json
│       ├── reproduce.json       # LIST: attempt 1 is deliberately non-reproducing → exercises retry
│       ├── fix.json
│       └── verify.json
├── tickets/                     # drop customer recordings here (gitignored except a sample)
└── out/                         # all run artifacts (gitignored)
```

**Known-unfinished items** (in priority order — see §8 task list):
1. `npm install` + `npx playwright install chromium` have not been verified in a clean env.
2. The mock run has never completed end to end. Make it pass first.
3. No real video in `tickets/`. Need `tickets/ticket-001.webm` recorded from the app.
4. No `.env.example`, `.gitignore`, `README.md`.
5. No web UI (stretch — §9).

---

## 2. Non-negotiable constraints

- **Node ≥ 20, ESM only.** No TypeScript, no build step. Keep it runnable with `node`.
- **Model string is `gemini-4-argon`** (from the hackathon guide). Override with `GEMINI_MODEL` env var if the builder guide says something different. **Check the Google DeepMind "Gemini 4 Argon Hackathon Builder Guide" (linked from the participant guide) for the exact model id, SDK version, Files API limits, and max output tokens before the first real call.** If the guide names a different SDK method shape for video input, adapt `gemini.js` — that file is the only place SDK calls live.
- **Secrets:** API key only via `GEMINI_API_KEY` in `.env` (dotenv-less: use `node --env-file=.env`). `.env` is gitignored. Never log it. Never commit it. If a secret is ever printed to the terminal during the demo, we lose.
- **The pipeline must never edit files outside `app/`** and must never edit `app/tests/` during the *fix* stage. Those guards already exist in `stages.js` (`touched` filter) and `repo.js` (`applyWrites` path check). Keep them.
- **Every model output is checked against reality before it is trusted.** A test the model writes must *fail* on current code or it is rejected. A fix must make that test *and* the full suite pass or it is rejected. The after-video is watched by the model and must get `verdict: "fixed"` or no PR is opened. This is the "real verification loop" the judges are scoring.
- **Repo must be public** at submission time. Demo video ≤ 1 minute. Everything in the demo must be built today (it is).

---

## 3. End-to-end flow (contract)

```
tickets/<id>.webm ──► uploadVideo ──► ANALYZE ──► REPRODUCE loop ──► FIX loop ──► VERIFY ──► PR
                                        │              │                │            │
                                        │              │ runs test:     │ runs test: │ uploads
                                        │              │ must FAIL      │ must PASS  │ after.webm,
                                        │              │ (records       │ + suite    │ watches both
                                        │              │  before.webm)  │ (records   │ videos,
                                        │              │                │  after.webm)│ verdict
                                        ▼              ▼                ▼            ▼
                                   bug report      spec file        edited files   PR.md + videos
```

Each arrow below is a function in `pipeline/stages.js`. Inputs/outputs are exact.

### 3.1 `uploadVideo(path) → Part`
- Uses Files API (`ai.files.upload`), polls until `state === 'ACTIVE'`.
- Returns `{ fileData: { fileUri, mimeType } }`. In `--mock` returns a text placeholder.
- Accept `.webm` and `.mp4`. Playwright records `.webm`; Loom/QuickTime give `.mp4`.
- **TODO:** cache uploads by sha256 in `out/uploads.json` so a re-run doesn't re-upload (saves ~20s on stage).

### 3.2 `analyze({root, videoPart}) → BugReport`
Parts sent: `[video, ANALYZE prompt, repo snapshot]`. JSON response:
```json
{
  "title": "string, imperative, ≤ 80 chars",
  "observed_steps": ["mm:ss — action", "..."],
  "expected": "string",
  "actual": "string",
  "evidence_timestamps": ["mm:ss — what is visible"],
  "suspected_files": ["relative/path"],
  "root_cause_hypothesis": "paragraph naming functions/lines",
  "confidence": 0.0
}
```
Acceptance: `title`, `expected`, `actual`, `suspected_files[0]` all non-empty; `suspected_files` all exist on disk (drop ones that don't, log it).

### 3.3 `reproduce({root, videoPart, bug, ticketId}) → {specRel, spec, beforeVideo, output}`
- Writes `app/tests/ticket-<id>.spec.js` from the model's JSON `{path, content, what_it_asserts}`.
- Runs **only that spec** with `runPlaywright(root, specRel, {label:'before'})`.
- **If it PASSES → reject**, feed Playwright output back via `REPRODUCE_RETRY`, loop (max `TICKETFIX_MAX_TRIES`, default 3).
- **If it FAILS → accept**, keep `videos[0]` as `before.webm`.
- Edge: a test that fails for the *wrong* reason (syntax error, bad selector) is still "failing". **TODO:** detect `SyntaxError` / `Error: locator.click: Timeout` in output and treat as a *retry*, not an accept. Pass the output back with "your test errored rather than asserting the bug".

### 3.4 `fix({root, bug, specRel, spec}) → {rationale, diff, afterVideo}`
- Model returns `{rationale, files:[{path, content}]}` — **full file contents**, not diffs. (This is deliberate: Argon's long output window makes full-file rewrites reliable and removes patch-application failure modes.)
- Filter: only `app/**` and not `app/tests/**`. Write with `allowNew:false`.
- Run the repro spec → must pass. Then run the **whole suite** → must pass. Then re-run the repro spec once more so `out/videos/after-1.webm` is the clean after-recording.
- On any failure: feed output back via `FIX_RETRY`, loop. **Before each retry, `git checkout -- app/public` is NOT done** — the model sees its own edits in the fresh snapshot and iterates on them. That's intentional. (If it keeps digging a hole, the retry prompt should say so; `MAX_TRIES` bounds it.)
- `diff` = `git diff` of the working tree (needs the repo to be a git repo with a clean baseline commit — see §6).

### 3.5 `verify({bug, originalVideoPart, afterVideoPath, diff}) → Verdict`
Parts: `[label, originalVideo, label, afterVideo, VERIFY prompt, diff]`. JSON:
```json
{
  "verdict": "fixed" | "not_fixed" | "inconclusive",
  "original_video_summary": "string",
  "fixed_video_summary": "string",
  "comparison": "string with timestamps",
  "pr_description": "markdown"
}
```
- Only `"fixed"` proceeds to a real PR. Anything else still writes `out/pr/<id>/` (so the demo can show the model *refusing*), but `dryRun` is forced.
- **TODO:** on `not_fixed`, loop back to `fix()` once with the verifier's `comparison` as extra context. This is the headline "watches the result, critiques it, fixes it" loop — worth doing if time allows (§8, P1).

### 3.6 `openPr(...)`
- Always writes `out/pr/<id>/PR.md`, `fix.diff`, `before.webm`, `after.webm`, `run.json`.
- If not `dryRun`: `git checkout -b ticketfix/<id>`, `git add app`, commit, `gh pr create --body-file`.
- **Commit message must end with** (per the environment's attribution rule):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PhAraGhd51U3DXAQV5mGZb
  ```
  and the PR body must end with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  https://claude.ai/code/session_01PhAraGhd51U3DXAQV5mGZb
  ```
  Keep the existing "Generated by TicketFix with Gemini 4 Argon" line too.
- `gh` needs the branch pushed first: add `git push -u origin <branch>` before `gh pr create`, tolerate failure (log, keep going).
- Videos can't be embedded in a PR body via API. Plan: upload `before.webm`/`after.webm` as release assets or just leave them in `out/pr/` and screen-share during the demo. Don't burn time on GitHub video hosting.

---

## 4. Prompting rules (pipeline/prompts.js)

- One `SYSTEM` string, reused. It says: watch the video, read the whole repo, respond ONLY with the requested JSON, never guess — cite timestamps.
- Every stage prompt ends with an explicit JSON schema. Set `responseMimeType: 'application/json'` on every call. `parseJson()` still tolerates fences.
- Part ordering matters for long context: **video first, then instructions, then repo snapshot** (largest last). Keep it.
- Retry prompts always include the raw (ANSI-stripped, head+tail-trimmed, ≤ 6000 chars) Playwright output — the model needs the actual assertion message.
- Temperature `0.2`. Don't raise it.
- If the builder guide gives a `thinkingConfig` / reasoning-budget knob, enable it for ANALYZE and VERIFY (the video stages); leave it default for REPRODUCE/FIX.

---

## 5. Target app ("Taskly") — demo-day details

The planted bug is the **only** bug the demo needs. Steps to trigger it (this is the 20-second recording we make):

1. Add "Buy milk", "Walk dog", "Pay rent".
2. Tick "Buy milk" done.
3. Click **Active** → list shows Walk dog, Pay rent.
4. Click **×** on "Pay rent" → **Walk dog disappears instead.**
5. Click **All** → Buy milk, Pay rent. Walk dog is gone.

A second, optional planted bug for a second live ticket if judges ask "does it only work on one bug?":
- In `setFilter`, the `aria-pressed` update is correct but the **Done** filter reads `t.done` — introduce `filter === 'done' ? todos.filter(t => !t.done)` to make Done show active items. Visually obvious, one-line fix, different file region. Only add this on a separate branch `demo/bug-2`; keep `main` with exactly one bug.

Accessible names the tests rely on (do not change in index.html/app.js without updating smoke.spec.js):
- placeholder `What needs doing?`; button `Add`; buttons `All` / `Active` / `Done`
- checkbox aria-label `Mark <title> done` / `Mark <title> not done`
- delete aria-label `Delete <title>`; list items `#list li`; done class `li.done`

---

## 6. Setup & environment

```bash
cd ticketfix
npm install
npx playwright install chromium        # if it fails on missing OS libs: npx playwright install --with-deps chromium (needs sudo)
cp .env.example .env                   # then paste GEMINI_API_KEY from ai.studio
git init && git add -A && git commit -m "baseline: Taskly with planted delete bug"   # pipeline diffs against this
```

`.env.example`:
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-4-argon
TICKETFIX_MAX_TRIES=3
```

`.gitignore`:
```
node_modules/
out/
.env
tickets/*
!tickets/ticket-001.webm
!tickets/.gitkeep
```

Run:
```bash
npm run fix:mock -- tickets/ticket-001.webm     # no API key needed; exercises every loop incl. a retry
node --env-file=.env pipeline/index.js tickets/ticket-001.webm --no-pr   # real model, no PR
node --env-file=.env pipeline/index.js tickets/ticket-001.webm           # real model, opens PR
```

Reset between demo runs (important — the fix stage leaves the app fixed!):
```bash
git checkout -- app && rm -f app/tests/ticket-*.spec.js && rm -rf out
```
Add this as `npm run reset`.

---

## 7. Recording the sample ticket

Option A (fast, deterministic): a Playwright script `scripts/record-ticket.js` that boots the app, performs the 5 steps in §5 with `slowMo: 600` and `recordVideo`, and saves to `tickets/ticket-001.webm`. ~15 lines. **Do this first**; it also doubles as the "judge-provided input" fallback if the live recording fails.

Option B (for the pitch): QuickTime/Loom screen-record a human doing the same steps on `http://localhost:4173`, save as `tickets/ticket-002.mp4`. Use this one on stage — a human-recorded video with cursor jitter is a more convincing input than a Playwright render.

---

## 8. Task list for Claude Code (do in order, commit after each)

**P0 — must work by 3:00 PM**
- [ ] `npm install`; `npx playwright install chromium`; `npm run test:app` passes (smoke).
- [ ] Write `.gitignore`, `.env.example`, `npm run reset` script.
- [ ] `git init` + baseline commit (pipeline's `gitDiff` depends on it).
- [ ] `scripts/record-ticket.js` → produces `tickets/ticket-001.webm`. Commit the webm (it's small).
- [ ] `npm run fix:mock -- tickets/ticket-001.webm` runs **end to end** and produces `out/pr/ticket-001/{PR.md,fix.diff,before.webm,after.webm,run.json}`. Expected log: analyze → repro attempt 1 passes (rejected) → attempt 2 fails (accepted) → fix → repro passes → suite passes → verdict fixed → PR package written. Fix any bug in `stages.js`/`runner.js`/`gemini.js` surfaced by this.
- [ ] Confirm `runner.js` harvests exactly one `.webm` per single-spec run and names it `<label>-1.webm`.
- [ ] Swap in the real API: read the DeepMind builder guide, confirm model id + SDK call shape, run `--no-pr` with a real key. Fix any schema drift in `gemini.js` only.

**P1 — should work by 4:00 PM**
- [ ] `fix` ↔ `verify` back-loop: if verdict is `not_fixed`, re-enter `fix()` once with `verdict.comparison` appended to the FIX prompt. Cap at 1 extra loop.
- [ ] `reproduce`: treat `SyntaxError`/timeout-on-locator as retry, not accept (§3.3).
- [ ] Upload caching by sha256 (§3.1).
- [ ] `git push` before `gh pr create`; push the repo to GitHub as **public**; run the real PR path once so a PR exists to show.
- [ ] `README.md`: pitch, architecture diagram (ASCII is fine), setup, demo script, "what's built today" section (judges must be able to identify original work — it's everything).

**P2 — only if P0/P1 are green**
- [ ] Minimal web UI (§9).
- [ ] Second planted bug on `demo/bug-2` (§5).
- [ ] 1-minute demo video for the submission form (screen-record the mock run + the PR page).

**Do NOT do:** TypeScript migration, Docker, a dashboard, multi-repo support, auth, deploying anywhere. None of it is scored.

---

## 9. Stretch: web UI (P2)

Single-page `ui/index.html` + `ui/server.js` (express, port 4180):
- Drag-drop a video → POST `/run` (multipart) → server spawns `pipeline/index.js` and streams its stdout over SSE to the page.
- Page shows the log lines live, then renders `before.webm` and `after.webm` side by side with the PR markdown underneath.
- No framework, no build. Vanilla JS, ~150 lines. Only worth it if the terminal demo already works flawlessly.

---

## 10. Managed Agents angle ($5k side prize)

If the builder guide documents Managed Agents: wrap `reproduce` and `fix` as two managed agents with a shared sandbox that has the repo checked out and Playwright installed, so the model *runs the tests itself* inside the agent loop rather than our Node harness driving it. Keep the Node harness as the fallback. Decide at **3:30 PM** based on P0 status; do not start before then.

---

## 11. Demo script (3 min, no slides)

0:00 — "This is a ticket we got this morning." Play `ticket-002.mp4` (15s). "No steps, no logs, just the video."
0:20 — `npm run reset && node --env-file=.env pipeline/index.js tickets/ticket-002.mp4`. Narrate the log as it streams: *"It's watching the video and reading every file. It thinks it's the delete handler. It's writing a test that does what the customer did — and the test fails, which is what we want. Now it's fixing. Test passes, suite passes. Now it's recording the fix and watching that video next to the customer's."*
2:00 — Verdict prints `fixed`. Open the PR in the browser: root cause, the test, the diff, the verifier's side-by-side summary. Play `after.webm`.
2:40 — "Who it's for: the support engineer who gets forty of these a week. What's only possible with Argon: it watched a video, held the whole repo, rewrote whole files, then watched a second video to check its own work. Everything you saw was built today."

Fallback if the API is slow/down on stage: `npm run fix:mock` runs the identical loop with canned responses in ~40s. Say so honestly; show the real `run.json` from an earlier successful run.

---

## 12. Definition of done

- `npm run fix:mock -- tickets/ticket-001.webm` exits 0 and `out/pr/ticket-001/PR.md` exists.
- `node --env-file=.env pipeline/index.js tickets/ticket-001.webm --no-pr` exits 0 with `verdict: fixed` at least once (keep that `run.json` as evidence).
- Repo is public on GitHub with README, and at least one real PR opened by the pipeline.
- Submission form filled with repo link + ≤1-min video before 5:00 PM.
