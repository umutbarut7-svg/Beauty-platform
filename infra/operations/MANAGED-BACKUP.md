# ORZELL daily encrypted database backup

The owner approved a 30-day recovery window on 6 November 2026. This update
prepares daily backups at 03:00 Europe/Istanbul and hourly health checks. The
preparation request only installs reviewed tools, a separate signing key and
disabled systemd units. It neither reads the database nor enables timers.

## Owner cloud update

Run `approve-backup-retention.py --apply` from the reviewed immutable commit in
the owner's AWS CloudShell. It verifies the existing account, stack, instance
role and original template before one CloudFormation update. It preserves the
bucket and its encryption, versioning, public access blocks and explicit runtime
delete denial. It adds the approved lifecycle, namespace-limited metric publishing
and one CloudWatch alarm. The operations bridge cannot update CloudFormation or
IAM; do not broaden that bridge to avoid this owner step.

`RETENTION_UPDATE_REQUESTED` only acknowledges submission. Require actual
`UPDATE_COMPLETE`, exact template/policy, live lifecycle and alarm verification
before activation. If status is uncertain, inspect the existing operation; do not
resend blindly. The helper accepts the exact desired template as an idempotent
no-op, and refuses unknown stack changes.

## Retention and monitoring semantics

Only `encrypted/v1/` expires. Current objects expire after 30 days; noncurrent
versions are scheduled for cleanup after one additional day, and expired delete
markers are removed separately. S3 lifecycle processing is asynchronous. This is
a 30-day recovery window with subsequent cleanup, not guaranteed physical erasure
at exactly 720 hours. The signed ZIP includes its manifest and ciphertext so the
same lifecycle applies to both. No older production backups currently exist.

One CloudWatch `ORZELL/Backup` metric and one hourly alarm detect failure, a backup
older than 26 hours or missing telemetry. Missing data breaches the alarm. There
is no email/SMS/SNS notification route; console alarm state is not proof that a
person received an alert. This does not settle application privacy, erasure or
other AŞAMA 33 acceptance requirements.

## Activation and evidence

After the owner cloud update succeeds, record the prepared release SHA and the
public signing PEM/fingerprint outside the host. Add the fixed activation request
with those exact bindings. Its workflow first audits cloud state, checks installed
configuration and units, then runs the first backup. Only a successful verified
upload and health publication permit enabling the two new timers. Partial timer
activation is rolled back. Uncertain activation leaves a durable started marker
and requires inspection before any further attempt.

The live recipient public certificate is pinned. The owner's recovery private key
stays off the server and is never used by the service. The server signing key is
separate and cannot decrypt the database. A production package has not been
independently restored with the owner's recovery key until that separate recovery
exercise is explicitly completed; upload/checksum evidence alone is not such proof.

## Operating boundaries

The producer streams `pg_dump --format=custom` directly into encryption and signs
the ciphertext metadata. No plaintext database dump file is written. A backup is
bounded to 128 MiB, retains at least 1 GiB of free disk plus two package sizes,
uses a 300-second database producer deadline and a 384 MiB service memory limit.
App/worker images and running container identities must match the reviewed source;
a later deployment needs an explicit backup configuration review.

Each UTC day has one create-only object key and durable local receipts. Ambiguous
uploads stop without overwriting or deleting remote objects. Success requires the
S3 version, SHA-256 checksum, encryption metadata and downloaded ciphertext to
match, and application services to remain unchanged. Verified local ciphertext is
removed; failed encrypted staging stays private for inspection and disk reserve
prevents unlimited consumption. Future growth past the cap requires review.

The CI job uses only an isolated synthetic PostgreSQL database and temporary test
keys. It creates a real signed encrypted managed package, decrypts it and restores
it into a separate test database. It also covers wrong retention, source changes,
corrupt readback, ambiguous upload, disk limits, stale health, partial installation
and activation rollback. No live key or customer data enters CI.
