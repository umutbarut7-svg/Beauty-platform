# Protected handoff to offline PostgreSQL restore

`restore-protected-handoff.py` connects the existing protected handoff to the
isolated restore controller. Previously those boundaries were exercised in
separate tests. This bridge accepts an existing caller-owned handoff session and
an encrypted capsule, authenticates the pinned CMS package, obtains only a
sealed dump descriptor, and passes that descriptor with the independently
approved schema reference into the existing offline controller.

The key and password never become Docker inputs, subprocess arguments or report
fields. The context closes key/password/dump descriptors before returning a
noncontent report. The handoff session is closed on success, restore failure,
policy rejection or invalid budgets. A typed session, explicit offline access
invalidation acknowledgement, bounded encrypted input, existing decryption
limits and a restore deadline are required. No schema reference is learned from
the restored target. Existing domain checks, repeated quarantine, record
preservation, network isolation and target cleanup are retained.

The CLI accepts no private file, capsule, live mode or receiver option; it
defaults to `OFFLINE_NO_ACTION`. There is no endpoint, host deployment, role,
logging change, client distribution or live intake in this change. The host,
context, client and independent challenge-pin authentication remain the caller's
responsibility. Root/same-user threats, formal independent review and memory
zeroization are not resolved by composing these components.

## Validation

Five focused tests exercise validation before private I/O, sealed dump/schema
handoff, descriptor closure on downstream failure and success, input/session
boundaries, and the default CLI. The existing generated PostgreSQL harness now
uses real Node Web Crypto → protected key/CMS verification → sealed dump →
network-none PostgreSQL → domain checks → repeated quarantine → verified target
cleanup for its positive case. It does not add a duplicate positive restore.
The existing schema/domain mismatch cases remain separate negative boundaries.
Only the fixture patches the host check; the bridge has no host-check bypass.

This is synthetic integration acceptance, not the owner's real iPhone or key,
an approved recovery host, production restore, actual RTO/RPO, erasure
reconciliation or permission to reopen the application. Success reports keep
`productionRestoreVerified`, `realRecoveryReady` and `reopenAuthorized` false.
Stage 33 remains **NOT PASS** until the actual acceptance steps are complete.
