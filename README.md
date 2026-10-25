# TicketFix

**Support engineers get "it's broken" tickets with a screen recording and no repro steps.** TicketFix takes that recording and the app's code, and returns a reviewable PR with proof:

1. **Gemini 4 Argon watches the video** and reads the app's source, then writes a bug report with timestamps and a root-cause hypothesis.
2. It **writes a Playwright test** that does what the customer did. The test must **fail** on the current code, or it is rejected and rewritten. A test that crashes or times out doesn't count as a failure; only a failed assertion does.
3. It **fixes the bug** with full-file rewrites. The fix must make the repro test **and** the whole suite pass, or it is retried with the Playwright output.
4. The fixed test is **re-run with recording on**, and Argon **watches its own after-video** next to the customer's. Only a `fixed` verdict opens a PR. A `not_fixed` verdict sends the critique back to the fix stage once.
5. **PR** with the test, the fix, the verifier's side-by-side summary and before/after videos.

Every model output is checked against reality before it is trusted.

```
tickets/<id>.webm ─► upload ─► ANALYZE ─► REPRODUCE loop ─► FIX loop ─► VERIFY ─► PR
                                 │          test must FAIL     test + suite    watches both
                                 │          (before.webm)      must PASS       videos → verdict
                                 ▼                             (after.webm)        │
                             bug report                           ▲  not_fixed ────┘ (once)
```

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env            # add GEMINI_API_KEY
```

## Run

```bash
npm run fix:mock -- tickets/ticket-001.webm                               # canned model responses, no key needed
node --env-file=.env pipeline/index.js tickets/ticket-001.webm --no-pr    # real model, no PR
node --env-file=.env pipeline/index.js tickets/ticket-001.webm            # real model, opens a PR
npm run reset                                                             # the fix stage leaves the app fixed — reset between runs
```

Artifacts land in `out/pr/<ticket>/`: `PR.md`, `fix.diff`, `before.webm`, `after.webm`, `run.json`.

`node scripts/record-ticket.js` re-records the sample ticket. Any `.mp4`/`.webm` screen recording of the app on `http://localhost:4173` works as input.

## What's in the repo

| Path | |
|---|---|
| `app/` | **Taskly**, the demo target: a tiny todo app with a planted bug (deleting under the Active/Done filter removes the wrong item) |
| `pipeline/` | The pipeline: `stages.js` (the four stages and their loops), `gemini.js` (all SDK calls), `prompts.js`, `runner.js` (Playwright + video harvest), `repo.js`, `pr.js` |
| `pipeline/mock/` | Canned responses for `--mock`; the first repro attempt is deliberately wrong to exercise the retry |
| `evidence/real-run-ticket-001/` | A real `gemini-4-argon` run: `verdict: fixed` in ~80s, first attempt at every stage, with the test, diff and both videos |
| `tickets/ticket-001.webm` | The sample customer recording |

The model sees only `app/`, `package.json` and `playwright.config.js`, never the spec, the mocks or the evidence, so it has to find the bug from the video and the code.

## Built today

Everything here was built during the Gemini 4 Argon hackathon on Oct 25, 2026.
