# Explain the physical-phone matching rate limit

## Latest checkpoint — 30 October 2026 (Istanbul)

Reviewed source `36bf4a29ef21427a995a01ea28a3a7604b1588ba` passed all four final-head gates:

- [Application review 40962364004](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40962364004): frozen install, 39 mobile/client tests and intercepted Chromium/WebKit application, photo, matching and saved-consultation recovery.
- [Repository/API/integration 40962364008](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40962364008): PostgreSQL/HTTP/worker/storage, workspace build, lint, formatting and type checks.
- [Android/iOS compilation 40962364015](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40962364015).
- [Synthetic native photo runtime 40962364000](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40962364000): real simulator photo IO and loopback multipart acceptance.

The parent action runner takes a synchronous lock before invoking an action, so a duplicate press cannot release the original pending action's busy state. The consent checkbox exposes its actual checked state on web and native. Matching checks cover duplicate presses, 503/429 without automatic retry, retained MATCHED/NO_MATCH results, read-only refresh, replacement, withdrawal and expired authentication. Final screenshots from both browser engines were visually inspected.

[PR #69](https://github.com/umutbarut7-svg/Beauty-platform/pull/69) merged as `52ee6c0216ce77bd1b0599b6857049a3fccadb90`; its tree exactly equals the tested source tree. Signed internal delivery source `9f0062a681ed62a1af19b714cf41a49404e09c37` differs only in the upload workflow's introductory comment. [Upload 40964133563](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40964133563) is preparing ORZELL 1.0.0 (1101); upload acceptance, Apple processing and existing-group availability are pending at this checkpoint.

Relative to build 1091, dependencies, lockfile, networking and encryption inventory are unchanged. No live AI/provider request or runtime quota change was made. The prior single paid matching authorization is consumed and the original limits were restored. Completed matching results are retained within the current screen; this is not a durable server cache across reopening/reloading. Live matching quality, physical acceptance of this update, Android physical acceptance, remaining result-write device checks and full Stage 33 remain open.

Earlier evidence follows and is superseded where this checkpoint records a newer result.


The owner's approved saved-plan matching attempt displayed a generic
information-check error on 29 October 2026 at 22:09 Istanbul time.

The bounded read-only preview inspection
[40938329690](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40938329690)
observed two matching POST responses with HTTP 429 in the 22:08–22:11 Istanbul
window and two RATE_LIMIT_EXCEEDED records. Only whitelisted request metadata
and aggregate counters were emitted; no identity, photo, plan, token or key was
printed. The API's configured per-user daily limit was 5 and its current daily
counter was 7; the global limit was 20 and global counter 7.

The API's existing guard consumes the shared daily limit before query embedding.
These denied requests were stopped before the OpenAI provider. This does not
prove the matching/provider/index quality path; that acceptance is still open.

The mobile client previously mapped 429 to the same generic message as an
invalid request. It now displays: “İstek sınırına ulaşıldı. Lütfen daha sonra
yeniden deneyin.” It does not retry the POST, change a quota, parse upstream
content or clear the signed-in session. A regression check covers those
properties. All 9 focused client tests, focused formatting and whitespace checks
pass locally using the existing cached tools; frozen dependency installation and
native delivery require their separate CI/release evidence.

The owner's one paid saved-plan matching test remains authorized and unobserved.
No new photo analysis, indexing or repeated paid retry is authorized. Any
temporary availability adjustment must remain bounded to that approved attempt,
preserve the global cap and restore the original configuration. Full Stage 33
is not PASS.

## Approved read-only follow-up

After explicit owner approval, [PR #66](https://github.com/umutbarut7-svg/Beauty-platform/pull/66)
merged as `1fe823588edc0f07f0aec1b61e5bdf9d6a706dc1`.
[Read-only inspection 40941550768](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40941550768)
passed at 22:36 Istanbul time. It confirmed the original daily cap 5 and global
cap 20, and the operation record was RESTORED at 22:29:15, before its 22:34:30
deadline. Current daily/global counters were 12. Four matching
RATE_LIMIT_EXCEEDED records exist in the 22:27–22:31 window.

The recreated API container no longer held the earlier matching HTTP log.
Consequently the single allowed attempt's result/provider execution cannot be
conclusively established from this inspection. Do not claim a successful match
or no provider charge for that allowed attempt, and do not repeat a potentially
paid request under the previous one-attempt authorization. The inspection itself
started no provider request and changed no runtime configuration.

[PR #67](https://github.com/umutbarut7-svg/Beauty-platform/pull/67) prepares
allowlisted timestamp/method/status preservation before future restoration.
Seven offline tests passed locally and in its dedicated contents-read-only CI.
It does not reopen the past operation and cannot recover its lost log. Full
Stage 33/live matching quality remains open.

All four PR #65 gates passed on `0c0cd428a41c16353ae8dffee0d24aff5ca78ac0`:
API/integration/workspace 40939092136, application review 40939092022, Android/iOS
compilation 40939091981 and synthetic native photo runtime 40939092046. PR #65
merged as `15b901b6567b6fbb8845184c24665c3edf63070a`. The release code differs
from the tested head only by documentation; the subsequent release marker
changes only the upload workflow's introductory comment. Signed internal
TestFlight delivery is running from `602e740bc3551d3c0b3d2150477a1bfe98c2f3ee`
in [40941963152](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40941963152).
Its expected build is 1091; Apple processing and internal access are not yet
claimed complete.

## Final internal delivery and acceptance boundary

ORZELL 1.0.0 (1091) is delivered to the existing owner internal TestFlight group:

- [Signed upload 40941963152](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40941963152) passed. Its 30 mobile release tests passed; Apple accepted the binary at 22:47 Istanbul time and temporary signing credentials were removed.
- [Apple processing and internal access 40943282462](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40943282462) passed. Build 1091 is VALID and IN_BETA_TESTING in the existing ORZELL iç test group at 22:49.
- No dependency/lockfile/network/encryption inventory change, external tester, public release or App Review submission was introduced.

[PR #67](https://github.com/umutbarut7-svg/Beauty-platform/pull/67) also merged to
main as `febec24635793d94dc808fcaaf7a527f778d5751` after dedicated safety
40942646971 and full repository validation 40942647155 passed. This preserves
bounded response metadata before future quota restoration. It is source-only:
no operation was started, no prior allowance reopened and no provider called.

The read-only follow-up approved in #66 is complete. The original quota was
confirmed restored. No new paid retry was made. The one permitted matching
attempt's result/provider execution is still not established because the
previous container's HTTP log was not preserved. Existing consultation,
result/satisfaction/passport display acceptance remains recorded; live matching
quality, other device/provider/policy conditions, the baseline historical
publication-queue assertion and full Stage 33 remain open.

Immediate owner action is TestFlight update to 1091 only. Do not ask for another
potentially paid match under the previous one-attempt approval. A further live
matching attempt would require a newly approved, strictly bounded opportunity
using the corrected metadata-preservation helper and its own operation record.

## Owner-reported request-limit wording and prepared next opportunity

After the guided 1091 update, the owner reported “İstek sınırına ulaşıldı”.
This is physical-user feedback for the corrected 429 wording. It does not prove
a successful provider match or a new successful embedding. The original
runtime allowance remains closed; no operation or provider request was started
while preparing the next step.

[PR #68](https://github.com/umutbarut7-svg/Beauty-platform/pull/68), head
`1261187377d4bb035b0ee18ee2a0ef7b17d3b217`, prepares a separate one-attempt
opportunity with current-counter preflight, unchanged global cap 20, the pinned
#67 metadata-preserving helper, a distinct record/timer, automatic restoration
and automatic read-only observation. Its dedicated PR CI 40945228006 passed all
15 preservation/opportunity tests; full repository CI 40945227628 was still
running at this checkpoint. Privileged jobs are skipped on PRs.

The PR is unmerged and the new opportunity has not opened. A new explicit owner
approval must cover merging #68 (which starts the checked-in main-only operation),
one new potentially paid app matching request and its automatic read-only result
inspection. Do not consume another potentially paid request under the previous
one-attempt approval.

## Approved observable opportunity is open

The owner explicitly approved PR #68's main merge, one new paid matching request
and automatic read-only result inspection. Both final-head gates passed:
40945228006 (15 safety tests) and 40945227628 (repository validation). PR #68
merged as `d1dbf855f8a635f18b28de42bb469df3e38a3992`.

[Controlled run 40946364002](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40946364002):
open job 123702667801 PASS at 23:09 Istanbul. Its exact output confirms 14 used,
temporary cap 15, exactly one remaining attempt for the observed active daily
actor, unchanged global cap 20, and automatic original-limit restoration. No
provider request was started by the opener. The owner is to use the existing
saved plan's professional-search button once and share the response.

The automatic observer job `123702942000` is already running in the same workflow.
After the attempt or deadline and restoration, read that job's result/logs; no
further protected-branch push is needed. Look for `CONTROLLED_MATCHING_RESULT`.
The new private record is
`/opt/epifiz/operations/matching-one-approved-test-20261029-second/result.json`.
The reviewed helper preserves whitelisted HTTP metadata before API recreation.
Do not reopen the record, start a second potentially paid request or infer
matching acceptance until the actual response is observed.

## Completed controlled attempt and result-retention correction

The owner reported that pressing the professional-search button did not open a
visible result. The automatic observer in
[40946364002](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40946364002),
job 123702942000, passed and recorded RESTORED with responseCapture CAPTURED.
Its preserved allowlisted metadata shows one matching POST HTTP 201 at
20:13:09.200Z, then HTTP 429 at 20:13:28.247Z and 20:13:30.103Z on 29 October.
The original daily cap was automatically restored. The response body was not
captured: HTTP 201 alone does not establish MATCHED rather than NO_MATCH, the
provider charge, or the relevance/quality of returned professionals.

The mobile handler kept the search button after a successful response and cleared
its previous result at the start of the next request. Thus a subsequent 429 could
remove a successful response from the screen. This correction preserves a
completed result and replaces that button with an accessible completion heading
and results immediately below the plan. A synchronous request latch prevents
same-context double presses before React renders busy state. Both MATCHED and
NO_MATCH complete the search; errors permit a later explicit retry and never
retry automatically. The latch and result are discarded when the consultation
context changes or photo consent is withdrawn. This is in-screen protection,
not durable server deduplication across reloads or reopening consultations.

Local cached-tool checks passed: shared-type build, mobile typecheck, focused
ESLint/Prettier, whitespace validation and 38 existing mobile/client tests.
The expanded intercepted browser acceptance covers 503/429, synchronous double
presses, retained MATCHED results after a read-only status refresh, completed
NO_MATCH and consent withdrawal while a response is pending. Browser CI and
signed TestFlight delivery still require their own results at this checkpoint.
No live API/provider request was made to verify this correction. The one newly
approved live matching opportunity is consumed and closed; do not request another
paid test under that approval. Full Stage 33 and live matching quality stay open.
