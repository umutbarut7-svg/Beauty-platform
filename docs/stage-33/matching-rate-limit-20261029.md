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
