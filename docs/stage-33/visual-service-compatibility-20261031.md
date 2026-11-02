# Reject unrelated hair-service recommendations

The physical iPhone journey recovered a consultation and its saved recommendation,
but the consultation described a haircut while the recommendation was extensions.
The stored request also contained conflicting haircut/extension terms. These
screens establish result recovery, not recommendation quality or photo fidelity.

The visual matching endpoint now requires one explicit, consistent hair-service
operation in both the stored user request/target and the plan's public search
query. Unknown, negated, mixed or conflicting operations complete as NO_MATCH
with CONSULTATION_UNCLEAR before provider work. The app explains that the service
type needs clarification; it never changes the existing consultation or starts
a new analysis automatically.

For a consistent operation, semantic distance ranks candidates but does not by
itself qualify a candidate. The current public, active, bookable and source-fresh
service title must identify the same operation. Only accepted references are
saved. Existing snapshots undergo the same check on every owner-authorized read
and completed POST replay, so old extensions results cannot bypass a haircut
request. A catalog containing only an unrelated neighbor returns NO_MATCH.

This is a deliberately conservative hair-only MVP guard with a bounded Turkish
and English vocabulary: cut, color, extensions, care and styling. It rejects
unclassified and compound titles, unsupported wording and named non-hair body
areas. It is not a general language classifier, a cosine threshold calibrated
against real data, or proof of a service's suitability for an individual. False
negatives are possible. Broader taxonomy coverage and visual-plan quality remain
separate acceptance work. The plan's full prose is not linguistically validated
by this guard. No calibrated similarity threshold has been invented.

No migration, new output snapshot format, provider/model/key configuration,
quota changes, catalog reindexing or additional provider call is introduced.
Existing expiry, consent/ownership, source-revision, concurrency and privacy
cleanup rules are retained. NO_MATCH remains a completed saved result.

Validation includes explicit-request unit cases, PostgreSQL provider-double
scenarios for conflicting inputs and unrelated/mixed candidate sets, old-snapshot
revalidation and saved NO_MATCH replay. Chromium/WebKit recovery scenarios cover
the explanation and the absence of a new search button on replay. This candidate
has not been deployed and does not close Stage 33 or live recommendation quality.
