# Bounded offline backup package recovery

`infra/operations/recover-backup-package.py` consumes the encrypted ZIP emitted by
the reviewed producer. It snapshots the input into a sealed Linux descriptor,
checks the end-of-directory record before the ZIP parser can allocate a large
directory, and accepts exactly `backup.cms` and `manifest.json`. Duplicate,
traversal, NUL and extra member names, comments, ZIP64, compression, symlinks,
encrypted ZIP members, inconsistent sizes and failed CRC checks are rejected.
The format intentionally matches this producer rather than arbitrary ZIP files.

Both package and ciphertext byte limits are mandatory positive integers, capped
at 1 GiB. The manifest is capped at 64 KiB; key/certificate/passphrase inputs at
1 MiB. Limits apply to actual streamed bytes, not only ZIP-declared sizes. All
inputs to cryptographic verification and decryption remain sealed snapshots.
Recovery needs enough memory/swap for the package, extracted sealed members and
the verifier's copies; a 1 GiB format ceiling is not an operational memory budget.

The output parent must already be an owned directory with no group/other access.
The verified decryptor checks independent signer/recipient fingerprints, exact
backup/application/boundary identifiers and the approved time window before
publishing a new 0600 plaintext dump. Existing outputs are never overwritten.
The tool does not connect to a database, select a target, run pg_restore, retrieve
keys, upload data, change services or reopen a recovered application.

Use named arguments `--package`, `--output`, `--public-key`, `--certificate`,
`--private-key`, `--expected-signer`, `--expected-recipient`, `--backup-id`,
`--application-sha`, `--boundary`, `--not-before`, `--not-after`,
`--max-package-bytes`, `--max-cipher-bytes` and optionally `--passphrase` (a
protected file path). Expected trust/context values must come from independent
recovery approval, never from the untrusted package itself. CLI output is status
only.

Ten new tests cover real signed CMS recovery, member/path/type rejection, actual
and declared byte limits, bounded directory parsing, CRC corruption, invalid
signature/context, private output permissions, existing-output preservation,
input replacement and bounded stream copying. The existing real PostgreSQL
producer test now uses this consumer before restoring into its separate fixture
database, eliminating ad hoc member extraction from that acceptance path.
The separate current-schema two-boundary restore matrix also packages its actual
snapshot, rejects a wrong signer before plaintext or target-database creation,
and runs this consumer before PostgreSQL restore and the existing privacy and
exact inventory/B2B preservation checks.

## Production boundaries

A private directory mode is not encrypted storage or protection from root,
same-user path replacement, swap access or crash leftovers during plaintext
decryption. The operator still needs a protected offline recovery workspace,
crash cleanup, storage capacity checks, durable independent keys and approval,
withdrawal/account quarantine and review before any restored system is opened.
No live backup, remote storage, scheduling, alerts or production restore is
configured by this change. Stage 33 remains **NOT PASS**.
