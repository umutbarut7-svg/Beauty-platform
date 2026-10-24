# Isolated privacy backup and restore acceptance

The workflow takes actual PostgreSQL custom-format pg_dump snapshots at both
BEFORE_WITHDRAWAL_COMMIT and AFTER_WITHDRAWAL_COMMIT boundaries. Each snapshot
is restored into a separate disposable database and checked with the compiled
application queries and two real cleanup-worker processes. The tested application
is `3be316d1b2458c49fde162147244aa8077a1f614`.

## Verified acceptance

[Backup/restore run 40077665935](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40077665935)
completed successfully. Inspect both matrix jobs when reviewing evidence.

- AFTER_WITHDRAWAL_COMMIT: withdrawal and scrubbed analysis survive restoration.
  Expired and withdrawn owner reads are denied before cleanup; a valid unexpired
  plan remains readable. Two cleanup runs erase eligible local files without
  duplicate evidence while preserving valid content and audit expiration.
- BEFORE_WITHDRAWAL_COMMIT: the isolated query first demonstrates that the older
  snapshot lacks the later withdrawal. The quarantine SQL rejects missing
  acknowledgement and a wrong database name. Correctly acknowledged quarantine
  invalidates all restored owners' consents and scrubs consultation content.
  Replay is idempotent and does not fabricate user-withdrawal events. Two cleanup
  workers erase the eligible local fixtures and preserve audit expiration.

The detailed offline procedure is in [offline-photo-restore.md](offline-photo-restore.md).
It is a prepared procedure, not authorization to invalidate live data.

[Worker loop/restart run 40102010117](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40102010117)
also passed against the same application revision: repeated sweeps, expiry,
injected storage failure, actual worker process crash, retry after restart,
exactly-once erasure audit and preservation of unexpired content. This is separate
evidence from the backup snapshot matrix.

## Evidence limits

These tests use disposable PostgreSQL and local synthetic files. There is no
public API listener, AWS/OpenAI credential, real customer photo, production flag
change, production backup upload or restore into the running preview. Only fixed
non-content evidence is uploaded; dumps and local fixture files are removed.
The PostgreSQL container supplies matching dump/restore tools.

Passing these tests does not establish encrypted production backups, automated
backup schedules, live S3 erasure/recovery, storage URL isolation, host recovery
or independently durable withdrawal replay. A live recovery must remain offline
until its own checks pass. Conservative invalidation also makes previously valid
restored consultations unavailable; it is not selective replay.

The [read-only live snapshot 40102518367](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40102518367)
verified service running/OOM state, restart policies, PostgreSQL volume, tested
API/gateway images, closed policy/provider flags and both API health/CORS checks.
It did not perform a restore or prove continuous live erasure.

Stage 33 remains **NOT PASS** while real-photo quality, policy review, physical
devices and live privacy/recovery acceptance remain open. Isolated evidence must
not be used to enable public photo/AI flags.
