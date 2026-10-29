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

Internal delivery is complete for ORZELL 1.0.0 (1081):

- Release source: `e2654bb542bb9886f0fe42d78c4a2e2f8a7dcf21`.
- [Signed upload 40933567057](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40933567057) passed on 29 October 2026. The exact mobile release's 30 tests passed; Apple accepted the signed binary at 21:52 Istanbul time. Temporary signing credentials were removed.
- [Existing internal-group access 40935043013](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40935043013) confirmed build 1081 as `VALID` at 21:55 Istanbul time and `IN_BETA_TESTING` for the existing `ORZELL iç test` group. No group or tester was added.
- The unchanged dependency/lockfile/network/encryption inventory was verified against build 1071 before reusing its reviewed platform HTTPS-only encryption declaration.
- No server change, real booking/result, new paid AI request, external testing, App Review or public release occurred.

Build 1071 does not contain this result correction; use 1081 for the remaining
physical-phone checks. The owner has now demonstrated opening an existing consultation on the phone
(acceptance below). This recovery action is read-only and does not reanalyze,
upload, embed or match.

Physical iPhone saved-consultation recovery now passed: the owner's 29 October
21:58/21:59 Istanbul screenshots show the active list, successful saved-session
opening, `Plan hazır`, restored analysis and the five-step plan. The screenshots
do not show the installed build number. Full evidence scope is recorded in
[consultation recovery](consultation-recovery-20261029.md).

Next owner step is to inspect Randevular and select a suitable completed test
appointment for result → satisfaction → Beauty Passport. Source-photo/plan
quality, plan-to-professional matching, result/satisfaction/passport physical
acceptance, Android physical acceptance and full Stage 33 remain open. Existing
booking/approval/cancellation acceptance remains recorded in #54 and is not
reopened.
