# Preserve the consultation plan when matching is unavailable

The owner reached PLAN on the physical iPhone build 1051, then the matching
action returned a generic unavailable error. Runtime inspection on main found
the semantic gate closed and no indexed public catalog entries. The previous
photo-read/upload defect is therefore distinct from this matching failure.

The consultation screen now reads authenticated capabilities when PLAN loads.
Only an explicitly enabled semantic capability exposes the search action.
Closed capability and capability-read failure have distinct messages and a
refresh action. Both keep the existing consultation plan visible. The action
rechecks capabilities immediately before requesting matches; a newly closed
gate avoids the POST. A race-time matching 503 also preserves the plan with the
specific unavailable message. Genuine NO_MATCH remains a separate outcome.
Existing withdrawal generation checks discard late matching results.
An expired authenticated capability read uses the parent screen's existing
sign-out/reset handler, so private plan content is cleared on HTTP 401.

Capabilities are configuration-only: an enabled response does not establish
catalog population, provider health or recommendation quality. No capability
read triggers analysis, embedding, indexing or a paid matching request. Search
continues to require the user's explicit action and existing server guards.

Local checks: mobile typecheck, changed-file lint/formatting, web export and all
36 mobile/client tests passed. Browser acceptance runs in the existing isolated
application-review workflow: Chromium and WebKit exercise closed and failed
capabilities, refresh, closing between render and click, server 503, NO_MATCH and
withdrawal while matching is in flight, and expired-session reset. All requests use intercepted synthetic
responses and pixels. CI results must be recorded against the candidate before
calling browser acceptance complete.

This source proposal does not distribute a TestFlight build, activate runtime
flags or populate the live catalog. Main PR preparation contains the optional
semantic overlay and the separate owner-approved activation/indexing procedure.
Stage 33 acceptance remains open.
