# Keep a result draft within its selected appointment

The continuation starts from the reviewed internal TestFlight source
`a17fa52a981d5d28c033dacbd2f0736bcaf0e8f7` (tree
`80d54e2bc3c235e98d9e7c54f72caf83637e816e`). Build 1071's signed upload
[40859264045](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40859264045)
and existing internal-group access check
[40860554256](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40860554256)
both completed successfully. The consultation API publication is recorded in #63.
Physical-iPhone booking, approval, status refresh and cancellation already passed
on build 1061 (#54); that owner scenario is not reopened here.

## Result correction

Selecting another appointment previously cleared the loaded result but kept the
previous appointment's typed summary. A completed appointment could therefore
display another appointment's draft. A failed GET also left `result: null`, so the
UI could offer result creation without establishing that a result was absent.

Opening an appointment now clears its draft and tracks result reads separately
as loading, ready or failed. A failed read offers an explicit read-only retry;
result creation requires a successful read with no existing result. Navigation,
workspace selection, booking creation and account reset clear the draft context.
Blank or over-limit text is rejected before submission. A failed write preserves
the same draft and existing idempotency key for retry; a successful write clears
the draft and displays the server result. The server's immutable result,
authorization, completed-job and tenant rules remain authoritative.

The existing isolated application script adds two completed synthetic appointments
and checks switching drafts, leaving/re-entering the screen, GET failure with no
creation form, read-only recovery of an existing result, invalid text, failed-write
preservation and same-key retry to the intended appointment. Its existing Chromium
and WebKit CI steps run these checks with every external request intercepted.
No real booking, result, satisfaction, photo or provider request is made.

## Validation boundary

Local shared-type compilation, mobile TypeScript, focused lint/formatting,
JavaScript syntax, whitespace checks and 38 cached mobile/client tests passed.
The local runtime has pnpm 11 rather than the repository's required pnpm 10.28.1,
so its automatic install was refused before changing shared dependencies. Local
checks invoke the existing cached tools directly; they are not a frozen-install
claim. Local Chromium/WebKit binaries are unavailable. The unchanged GitHub gates
use pnpm 10.28.1, the frozen lockfile and installed browsers; their final-head
results must be recorded before claiming this change's complete acceptance.

This source correction is separate from the already delivered 1071 binary.
Saved-consultation recovery and plan-to-professional quality still require the
owner's physical phone. Result/satisfaction/passport physical acceptance, Android
physical acceptance and the remaining Stage 33 conditions remain open. No new
paid AI operation, server publication, signed upload or public release is part of
this correction.
