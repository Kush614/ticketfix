// All prompts in one place so the team can iterate on them fast.

export const SYSTEM = `You are TicketFix, a senior engineer embedded in a support team.
You receive (1) a customer's screen recording and (2) the complete source of the application.
You work in strict, verifiable steps and ALWAYS respond with the JSON schema requested.
Never guess at what the video shows — describe concrete UI states and timestamps you observed.`;

export const ANALYZE = `Watch the customer's screen recording end to end, then read the whole repository.

Produce a precise bug report as JSON:
{
  "title": "short imperative summary, e.g. 'Deleting a todo in the Active filter removes the wrong item'",
  "observed_steps": ["step the user took, with approx timestamp", ...],
  "expected": "what should have happened",
  "actual": "what the video shows happened instead",
  "evidence_timestamps": ["mm:ss — what is visible", ...],
  "suspected_files": ["relative/path", ...],
  "root_cause_hypothesis": "one paragraph, referencing specific functions/lines",
  "confidence": 0.0-1.0
}`;

export const REPRODUCE = (bug, specPath) => `Write a Playwright test that reproduces this bug deterministically.

Bug report:
${JSON.stringify(bug, null, 2)}

Rules:
- The test MUST FAIL on the current (buggy) code and PASS once the bug is fixed.
- Assert on the user-visible symptom from the recording, not on implementation details.
- Use the app's existing accessible names / placeholders / roles (read the repo).
- Start from a clean state (e.g. clear localStorage after navigation if the app uses it).
- Toggle checkboxes with .click(), not .check() — the app re-renders the list on change, so .check() times out waiting on a detached node.
- File path: ${specPath}. Use ESM imports from '@playwright/test'.
- Keep it under 60 lines.

Respond as JSON: { "path": "${specPath}", "content": "<full file contents>", "what_it_asserts": "one sentence" }`;

export const REPRODUCE_RETRY = (output) => `Your test did NOT fail on the buggy code — it passed, so it does not reproduce the bug.
Playwright output:
${output}

Re-watch the recording, re-read the code, and rewrite the test so that it fails on the current code for the right reason. Same JSON schema.`;

export const FIX = (bug, spec) => `Fix the bug. You have the entire repo in context.

Bug report:
${JSON.stringify(bug, null, 2)}

Reproduction test (must pass after your fix):
${spec}

Rules:
- Return FULL contents of every file you change (not diffs). Only touch files under app/ (never tests).
- Minimal, root-cause fix. Do not refactor unrelated code. Do not change the test.
- Keep the existing code style.

Respond as JSON: { "rationale": "2-4 sentences", "files": [ { "path": "relative/path", "content": "<full file>" } ] }`;

export const FIX_RETRY = (output) => `Your fix did not make the test suite pass. Playwright output:
${output}

The repo snapshot below reflects your current edits. Diagnose and return a corrected fix. Same JSON schema (full file contents).`;

export const VERIFY = (bug) => `You are now the reviewer. You are given:
1. The ORIGINAL customer recording (the bug).
2. A NEW recording of the automated test running against the FIXED build.
3. The bug report and the code diff.

Bug report:
${JSON.stringify(bug, null, 2)}

Watch both videos. Decide whether the new recording demonstrates the bug is gone — the same user actions now produce the EXPECTED behavior.
Be skeptical: a passing test could assert the wrong thing. Compare what you SEE.

Respond as JSON:
{
  "verdict": "fixed" | "not_fixed" | "inconclusive",
  "original_video_summary": "what the customer did and what went wrong",
  "fixed_video_summary": "what the test did and what the UI showed",
  "comparison": "specific differences between the two, with timestamps",
  "pr_description": "markdown PR body for a human reviewer: context, root cause, fix, how it was verified"
}`;
