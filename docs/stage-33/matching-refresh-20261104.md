# Refresh a saved professional search without another photo analysis

A completed NO_MATCH is intentionally durable. After a new matching service is
published/indexed, reopening the consultation replays the older empty result.
Add an explicit same-plan refresh rather than uploading/analyzing the photo again.

## Behavior and authorization

GET keeps its read-only replay behavior and advertises an optional revision only
for a valid supported consultation whose projected result is NO_MATCH.
A new POST /matches/refresh accepts that revision and a bounded request ID.
The existing owner/consent/policy/expiry lock guards both claiming and saving.
The search query comes from the saved validated plan, never the request body.

The revision binds the plan ID and stored matching snapshot/attempt. Under the
existing PostgreSQL advisory lock, a stale different request is rejected;
a running request cannot start a second search. Completion retains its request ID
so exact replay returns saved state without another provider call.
A failed refresh retains the preceding result and request ID; ordinary POST
replay cannot silently retry that work. An explicit later refresh requires the
new revision. Withdrawal/expiry still scrub all matching fields and late replies
cannot restore them. An interrupted RUNNING request is not reclaimed automatically.

The client shows a separate explicit refresh action with the AI usage notice.
It preserves the plan and never uploads or analyzes another photo for this action.
The initial completed NO_MATCH loads revision metadata with a GET. Capability is
rechecked immediately before the explicit POST. Double presses are locked before
the first await; POST failures recover only with GET, never automatic paid retry.
An older server that omits the revision does not expose the new action.

## Scope and validation

No schema migration, dependency, key/model/quota, retention, indexing or original
logo/signing change is included. New provider work remains behind an explicit
user action and existing quotas; no live provider request is part of validation.
The DTO rejects malformed revision/request IDs; HTTP tests cover authentication,
foreign-owner denial, stale revisions and safe completed replay.
Real PostgreSQL/provider-double integration covers new matching services,
unchanged photo/plan/expiry, exact replay, concurrency, failed work, owner/expiry
and withdrawal guards, including a late result. Existing acceptance tests remain.
A separate intercepted browser suite covers Chromium/WebKit success, duplicate
presses, failure recovery, stale responses, closed capability and withdrawal.

Full candidate CI, actual API/internal binary delivery and the owner's physical
same-plan refreshed match are separate acceptance steps. Stage 33 is NOT PASS.
