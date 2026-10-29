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

## Validation and internal delivery

The reviewed head `ef1978d4e98b0c38fbcc4a2bd1a5dd55b7b70eb3` passed all four
GitHub gates with pnpm 10.28.1 and the frozen lockfile:

- [API, PostgreSQL, HTTP and worker validation](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40909964694): 441 API tests and 17 Stage 33 integration tests.
- [Application review](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40909964760): shared/mobile TypeScript, 38 mobile/client tests and intercepted Chromium/WebKit journeys, including result isolation, retry, photo picker, availability and consultation recovery.
- [Android APK and iOS simulator compilation](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40909964675).
- [Native iOS photo runtime](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40909964948): synthetic native photo IO and Expo HTTP multipart acceptance.

On 29 October 2026, following the owner's instruction to continue delivery,
[PR #64](https://github.com/umutbarut7-svg/Beauty-platform/pull/64) was merged into
`codex/orzell-testflight-upload` as
`c003ed82ea79690bb261ee93d39b4f4a0aefee62`. Its tree is
`1852b83fa54e30cdb8d682898bc424c70428f22e`, identical to the reviewed head's
tested tree. The subsequent internal-release marker changes only this document
and the upload workflow's introductory comment; signing, permissions, dependency
versions and release steps remain unchanged.

The existing owner-authorized signed upload is being started for the result
correction. Build 1071 does not contain this correction. A new build must complete
signing, Apple validation/upload, processing and existing internal-group access
verification before it is presented as available on the phone. No server change,
new paid AI request, external tester invitation, App Review or public release is
required for this client-only correction.

Saved-consultation recovery and plan-to-professional quality still require the
owner's physical phone. Result/satisfaction/passport physical acceptance, Android
physical acceptance and the remaining Stage 33 conditions remain open. Physical
booking/approval/cancellation acceptance remains recorded in #54 and is not
reopened.
