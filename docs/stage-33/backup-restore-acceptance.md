# Isolated privacy backup and restore acceptance

The gate takes an actual PostgreSQL custom-format `pg_dump` **after** the application's authoritative withdrawal transaction commits. It restores into a separate disposable database, checks the current database identity, then runs the unchanged compiled `VisualService.get` queries and two real cleanup-worker processes. The source application revision is `123e7339e2ab2a9e8e94f391a8431b73afc28efe`.

Required observations:

- Withdrawal and scrubbed analysis state survive the dump/restore boundary.
- Restored expired and withdrawn sessions are denied before cleanup. A valid unexpired owner plan remains readable, so the negative checks cannot pass merely because all reads are disabled.
- Cleanup physically removes eligible local fixture files, scrubs expired analysis content and records one erasure event per photo. A second worker run does not duplicate evidence.
- Unexpired fixture content and unexpired 90-day consent/audit evidence survive.
- The workflow uploads only fixed non-content evidence fields. The dump and fixture files stay in runner temporary storage and are removed in `finally`; the disposable database service is destroyed by CI.

The synthetic read-query configuration is enabled only inside the test process. There is no API listener, AWS/OpenAI credential, live database, customer photo, production flag change, backup upload or restore into a running preview. Storage erasure uses reserved local test files, not real S3. The test uses the PostgreSQL service container's own dump/restore tools so server/client versions agree.

## Acceptance boundary

A successful run establishes this post-withdrawal snapshot scenario only. It does not establish encrypted production-backup storage, automated backup schedules, full disaster recovery, real S3 recovery or sustained retention operation. It also does not establish a real HTTP authentication journey; the owner-scoped application query itself is exercised against the restored database.

An older snapshot taken **before** a withdrawal cannot contain that later revocation transaction. A restore of such a snapshot needs a separately reviewed reconciliation mechanism (for example, replay of durable privacy events) or a conservative quarantine/invalidation procedure before exposing restored photo/consultation data. This test does not implement or approve that missing production procedure. Passing the narrower snapshot test must not be used to reopen public photo/AI gates or declare Stage 33 PASS.

Stage 33 remains **NOT PASS** while the previously recorded device, real-photo, reviewed-policy and production privacy/recovery acceptance items remain open.
