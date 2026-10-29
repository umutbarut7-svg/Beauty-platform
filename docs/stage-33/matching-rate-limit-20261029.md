# Explain the physical-phone matching rate limit

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
