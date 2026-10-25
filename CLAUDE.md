# CLAUDE.md — working rules for this repo

Read `SPEC.md` first. It has the full architecture, stage contracts, task list, and demo script. This file is just the house rules.

## What this is
TicketFix: customer screen recording → Gemini 4 Argon watches it + reads the whole repo → failing Playwright repro test → fix → re-run with recording → Argon watches the after-video → PR. Hackathon project, deadline **5:00 PM PT today**.

## Rules
- Node ≥ 20, ESM, no TypeScript, no build step, no new frameworks.
- All Gemini SDK calls live in `pipeline/gemini.js`. Nowhere else.
- All prompts live in `pipeline/prompts.js`. Nowhere else.
- Never write outside `app/` from the pipeline; never let the fix stage touch `app/tests/`. Guards exist — don't remove them.
- `GEMINI_API_KEY` only from `.env` via `node --env-file=.env`. Never log it, never commit it, never hardcode it.
- Work in priority order from `SPEC.md` §8. P0 before anything else. Commit after each checkbox.
- Before the first real API call, check the DeepMind builder guide for the exact model id / SDK shape and update `gemini.js` if it differs from `gemini-4-argon`.
- `npm run fix:mock -- tickets/ticket-001.webm` must stay green at all times. Run it before every commit.
- Don't refactor working code. Don't add features not in the spec. Don't build a dashboard.

## Commands
```
npm run app            # start Taskly on :4173
npm run test:app       # playwright suite
npm run fix:mock -- tickets/ticket-001.webm
node --env-file=.env pipeline/index.js tickets/ticket-001.webm --no-pr
npm run reset          # git checkout -- app; rm ticket specs; rm -rf out
```

## Commit / PR attribution
End commit messages with:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PhAraGhd51U3DXAQV5mGZb
```
End PR descriptions with:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01PhAraGhd51U3DXAQV5mGZb
```
