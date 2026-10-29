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

## Physical iPhone existing-result and passport acceptance

On 29 October 2026 at 22:02–22:04 Istanbul time, the owner selected an existing
completed test appointment. The appointment detail displayed its stored test
summary and the existing `Kararsız` satisfaction outcome. The Bakımım tab then
displayed the same test summary and outcome in the owner's care history.
PASS: physical iPhone reading of an existing completed appointment result,
stored satisfaction and the corresponding visible passport entry.

This evidence is a read/display acceptance. It does not show a new result
submission, a new satisfaction submission or fresh worker execution in this
session. It does not exercise the draft-isolation/write-retry branches fixed
in #64; those retain their synthetic CI evidence. The screenshots do not show
the installed build number. No new appointment, result, satisfaction or paid
provider action was requested for this verification.

The passport's displayed 22 October date is sourced from the result's
`createdAt`, while the appointment's 23 October date comes from
`startsAt`. This is a distinction between stored fields, rather than proof of
a timezone conversion bug. The passport date currently lacks a label explaining
that it is the result-record date; a clarity improvement remains to be reviewed.

The next independent live check is plan-to-professional matching. Its explicit
button calls a POST that performs a new query embedding. On 29 October 2026,
after being told this is a new paid AI operation, the owner explicitly approved
one matching test using an existing saved plan and the existing configured
connection. This authorizes one explicit plan-to-professional query from the
physical app. It does not authorize a new photo analysis, catalog reindex,
credential change or repeated paid retries. No match response has yet been
observed; execution and acceptance remain pending the phone action.
Source-photo/plan quality, live matching quality, Android physical acceptance,
remaining result-write device checks and full Stage 33 remain open. Existing
booking/approval/cancellation acceptance in #54 is not reopened.

## Matching follow-up and the one approved test opportunity

The owner's 22:09 Istanbul attempt failed with HTTP 429, not an invalid form.
Read-only [inspection 40938329690](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40938329690)
observed two matching 429 responses before the provider guard, daily usage 7
against limit 5, and global usage 7 against limit 20. These denied matching
requests did not reach the query-embedding provider. Do not ask for another paid
approval for those denied requests.

[PR #65](https://github.com/umutbarut7-svg/Beauty-platform/pull/65) prepares a clear
429 message without automatic retry or session reset. Its 9 focused client
tests passed locally; application and full API/integration CI passed on
`0c0cd428a41c16353ae8dffee0d24aff5ca78ac0`. Native gates were still running at
the handoff. This wording is not yet included in installed build 1081.

The existing operations bridge opened one bounded opportunity in
[40939783083](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40939783083)
at 22:24 Istanbul time. The observed active daily actor had count 7; the API's
temporary cap 8 permits exactly one further attempt for that actor. Global cap
20, keys, image and all other runtime settings remain unchanged. Compose and
health/CORS checks passed, indexing queues were empty and unrelated services
were unchanged. No provider request was started by this operation.

A root-owned watchdog is configured to restore the original cap 5 after the
next observed attempt or ten minutes, allowing the in-flight request to finish.
Private operational state is
`/opt/epifiz/operations/matching-one-approved-test-20261029/result.json`.
Before another allowance or deployment, inspect its actual OPEN/RESTORED state
and current usage; never blindly reopen or assume restoration. The owner is to
tap the existing plan's matching button once and share its result. That phone
response and actual restoration are pending. Full Stage 33 remains open.
