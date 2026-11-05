# Encrypted fixture backup and current matching quarantine

The previous offline restore harness used an older application and only cleared
the original analysis fields. Current consultations also persist matching status,
request identity and matching output. This update pins the application to
`9c487dc425d157a2a5bb1de9bc48beab63eda90c` (TestFlight 1151 source) and removes
all three matching fields during offline SQL quarantine. It checks the SQL result
before starting the cleanup worker, so later worker cleanup cannot mask a leak.

Both real PostgreSQL snapshots, before and after a synthetic consent withdrawal,
remain offline. Every restored owner's photo consent is invalidated, including
owners whose later withdrawals are not present in the snapshot. The guarded SQL
still requires an explicit offline acknowledgement and the exact database name.
It runs twice to verify idempotence. Plan and matching contents are scrubbed,
the real compiled worker removes only local synthetic photo fixtures, and proof
expiry is preserved without fabricating user-withdrawal events.

The custom pg_dump archive is sealed using Node's AES-256-GCM before persistence.
Each archive has a random 96-bit nonce and a random 256-bit in-memory fixture key.
The envelope version, application SHA and snapshot boundary are authenticated.
The harness persists only ciphertext, reads it back, rejects corruption,
truncation, the wrong key, source revision and boundary before any target database
creation or pg_restore, and verifies the recovered archive SHA-256. No key,
archive or photo fixture is uploaded as an artifact. Evidence contains only
non-content checks, revision identifiers and archive digest. Fixture keys and
opened dump buffers are cleared and temporary files removed in cleanup.

This is an isolated encryption and restore rehearsal. It does not configure
production backups, durable storage, key custody, retention, monitoring, recovery
time objectives or selective account deletion replay. No serving database is
restored or quarantined. Account-erasure PR47 remains a separate draft; this test
does not implement restored-account quarantine or approve domain retention.
Production recovery and Stage 33 remain unaccepted until their real operational
requirements and other open device/product/policy gates are satisfied.

Validation: local authenticated-envelope tests pass. The pull request's PostgreSQL
matrix and repository checks provide the final candidate results.
