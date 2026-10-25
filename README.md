# TicketFix

**Support engineers get "it's broken" tickets with a screen recording and no repro steps.** TicketFix takes that recording and the app's code, and returns a reviewable PR with proof:

1. **Gemini 4 Argon watches the video** and reads the app's source, then writes a bug report with timestamps and a root-cause hypothesis.
2. It **writes a Playwright test** that does what the customer did. The test must **fail** on the current code, or it is rejected and rewritten. A test that crashes or times out doesn't count as a failure; only a failed assertion does.
3. It **fixes the bug** with full-file rewrites, front end or back end. The fix must make the repro test **and** the whole suite pass, or it is retried with the Playwright output.
4. The fixed test is **re-run with recording on**, and Argon **watches its own after-video** next to the customer's. Only a `fixed` verdict opens a PR. A `not_fixed` verdict sends the critique back to the fix stage once.
5. **PR** with the test, the fix, the verifier's side-by-side summary and before/after videos. Other bugs Argon spots while reading the code are listed under **"Also noticed"** instead of being slipped into the fix.

Every model output is checked against reality before it is trusted.

```
tickets/<id>.webm (+ optional <id>.txt customer message)
   │
   ▼
upload ─► ANALYZE ─► REPRODUCE loop ─► FIX loop ─────► VERIFY ─────► PR
          watch +     test must FAIL    test + suite    watches both    fix + test +
          read code   (before.webm)     must PASS       videos          "Also noticed"
                                        (after.webm)        │
                                            ▲  not_fixed ───┘ (once)
```

## Three real bugs, three layers

The demo app, **Taskly**, is a todo list with a small JSON API. It has three planted bugs, each in a different layer. Every one was fixed by a real `gemini-4-argon` run, on the first attempt at every stage:

| Ticket | Customer sees | Argon fixed | Evidence |
|---|---|---|---|
| `ticket-001` | Deleting a task under **Active** removes a different task | **Front-end logic:** `app/public/app.js` deleted by filtered index from the unfiltered list | [`evidence/real-run-ticket-001`](evidence/real-run-ticket-001) |
| `ticket-persist` | Ticked tasks are **unticked again after a refresh** | **Back-end logic:** `app/server.js` compared the URL's string id to a numeric id, so the update never saved | [PR #2](https://github.com/Kush614/ticketfix/pull/2) · [`evidence/real-run-ticket-persist`](evidence/real-run-ticket-persist) |
| `ticket-mobile` | On a phone, a long task has **no delete button** | **Layout:** `app/public/index.html` CSS pushed the × out of the row; long titles now wrap | [`evidence/real-run-ticket-mobile`](evidence/real-run-ticket-mobile) |

Each fix touched only the reported bug's file. One early ticket-001 run quietly fixed the server bug too, which led to the "fix only this ticket, list the rest" rule. Since then, every run has listed the other two bugs correctly under "Also noticed"; see PR #2.

**On a real Google bug:** given only the reporter's videos and Angular Material's code from before the fix, Argon found the exact cause of [angular/components#26557](https://github.com/angular/components/issues/26557): the same element the maintainers later changed. Its proposed fix would not have passed review. Full write-up: [`evidence/real-world-angular-26557`](evidence/real-world-angular-26557).

**Demo video (53s):** [`docs/demo.webm`](docs/demo.webm). It shows a real run on the back-end bug sped up 6×, the customer's video next to the fixed build, PR #2 with its "Also noticed" list, and the mobile layout fix.

## TicketFix Studio: the whole demo in one page

```bash
npm start            # → http://localhost:4180
```

One server runs everything. It starts Taskly, embeds it in the page, runs the pipeline and restarts Taskly afterwards, so you can click around the fixed build (back-end fixes included).

1. **The app:** Taskly runs live in the left pane. Switch to 📱 Phone for the layout bug.
2. **● Record bug:** records just the Taskly pane, using Chrome's tab capture cropped to the app. Break something, stop, and type the customer's one-line complaint. You can also drop a `.webm`/`.mp4`/`.mov` or pick a sample ticket.
3. **Fix it →:** the log streams live, then the page shows the customer video, before and after videos, the verdict and the PR. Taskly is now the patched build; try it, then **↺ Reset app** to bring the bugs back.
4. **🎥 Record session:** records the whole tab with your microphone and downloads a `.webm` when you stop. That's your demo video.

Tested end to end: a bug recorded live in the Studio (ticks lost on refresh) was fixed by a real `gemini-4-argon` run in 82s (`verdict: fixed`). The embedded Taskly then kept ticks across a reload, and Reset brought the bug back.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env            # add GEMINI_API_KEY
```

## Run

```bash
npm start                                                                 # TicketFix Studio on http://localhost:4180
npm run fix:mock -- tickets/ticket-001.webm                               # canned model responses, no key needed
node --env-file=.env pipeline/index.js tickets/ticket-persist.webm --no-pr  # real model, no PR
node --env-file=.env pipeline/index.js tickets/<new-ticket>.mp4           # real model, opens a PR
npm run reset                                                             # the fix stage leaves the app fixed — reset between runs
```

**Your own ticket:** run `npm run app` (Taskly on http://localhost:4173), screen-record yourself hitting a bug, and save it as `tickets/<name>.mp4`. Optionally add `tickets/<name>.txt` with the customer's one-line complaint. Then run it. `node scripts/record-ticket.js delete|persist|mobile` re-records the sample tickets.

Artifacts land in `out/pr/<ticket>/`: `PR.md`, `fix.diff`, `before.webm`, `after.webm`, `run.json`.

## What's in the repo

| Path | |
|---|---|
| `app/` | **Taskly**: `server.js` (Express + JSON API), `public/` (vanilla JS front end), `tests/` |
| `pipeline/` | `stages.js` (the four stages and their loops), `gemini.js` (all SDK calls), `prompts.js`, `runner.js` (Playwright + video harvest), `repo.js`, `pr.js` |
| `pipeline/mock/` | Canned responses for `--mock`, taken from a real run; the first repro attempt is deliberately wrong to exercise the retry |
| `evidence/` | Real runs: bug report, test, diff, PR text and both videos for each ticket |
| `ui/` | TicketFix Studio (`server.js` + one page): no framework, no build step |
| tag [`v1-single-bug`](https://github.com/Kush614/ticketfix/tree/v1-single-bug) | The first version: front end only, one bug ([PR #1](https://github.com/Kush614/ticketfix/pull/1)) |

## Making the checks trustworthy

- **The model sees only the app:** `app/`, `package.json` and `playwright.config.js`. It never sees the spec, the mocks or the evidence, which name the bugs, so it has to find the bug from the video and the code.
- **Watchable recordings:** the test runs it records use Playwright `slowMo`. At full speed the after-video was about one second long, and the verifier rightly said it couldn't tell what happened.
- **A fresh server for every test run,** on its own port. A server-side fix is always what gets tested, never a stale process.
- **Thinking on the video stages:** analyze and verify run with `thinkingLevel: high`.

## Built today

Everything here was built during the Gemini 4 Argon hackathon on Oct 25, 2026.
