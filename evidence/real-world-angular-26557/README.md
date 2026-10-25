# Real-world run: Angular Material tooltip bug (angular/components#26557)

**The bug report:** https://github.com/angular/components/issues/26557, a real Google library with two screen recordings from the reporter. After a tooltip appears, the input field next to it can't be clicked.
**The maintainers' fix:** https://github.com/angular/components/pull/26786 ([`maintainers-fix.diff`](maintainers-fix.diff)).

**What Argon got:** both reporter videos, the reporter's own "Actual Behavior" line ("Cannot click the input field."), and `src/material/tooltip`, `src/cdk/overlay` and `src/material/core/style`. That's 61 files at the commit **before** the fix (`76eeaaf20`). It got no issue text, no hints, and not the fix. Run with `scripts/diagnose.js` (diagnosis + proposed fix; this repo can't run Angular's test harness, so there is no reproduce/verify loop).

| | Argon (`gemini-4-argon`) | Maintainers |
|---|---|---|
| Location | `tooltip.scss`: the `::before` hover area | same ✓ |
| Root cause | The area extends 8px on **all** sides, so it covers the neighbouring input and swallows its clicks | same ✓ |
| Evidence from the video | "00:02 — clicking the input field highlights 'about' inside the tooltip instead of focusing the input" | — |
| Fix | Deletes the hover area entirely ([`proposed.diff`](proposed.diff)). That fixes the clicks, but **breaks** moving the pointer from the trigger onto the tooltip, which the area exists for. Its rationale claims a matching `tooltip.ts` change, but it returned that file **unchanged**. | Keeps the area only on the side facing the trigger |

**Verdict: the diagnosis is right; the fix would not pass review.** This is why the full TicketFix pipeline never trusts a fix on its own word: the fix must pass the reproduction test and the whole suite, and survive the video review. `scripts/diagnose.js` now flags any file the model says it changed but didn't.
