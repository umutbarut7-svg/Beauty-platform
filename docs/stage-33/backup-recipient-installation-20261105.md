# Public backup recipient installation

Umut explicitly requested creation/delivery of the recovery key and then said
`Kaydettim` after being told to save the complete delivery in his locked iPhone
note. Phone custody is acknowledged by the user; it is not a measured independent
recovery test. Do not ask for the same storage decision or transfer the private
key back to the server.

The fixed main-only operation installs only the public certificate for
`orzell-recovery-241abc0895734f65`. The pinned DER SHA-256 is
`241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c`.
The checked-in PEM is a public X.509 certificate, not the private delivery file.
Its signature is self-signed; trust comes from the separately reviewed pin.

Before any write, validation rejects extra PEM or private-key data, requires the
exact pin, RSA at least 4096 bits, key-encipherment usage and current certificate
dates. The existing API/worker images and running/no-OOM states are checked.
Every installation-directory ancestor must be a real root/current-user-owned
directory without group/other write permission. A new 0600 certificate is
hard-linked without replacement and directory fsync is performed. Existing
identical private-mode certificate files are accepted idempotently; different,
unsafe or symlink files are rejected rather than overwritten.

Destination: `/opt/epifiz/backup/trust/orzell-recovery-241abc0895734f65.crt`.
No backup producer, signer private key, scheduler, service or application setting
is created or changed. After installation, exact service IDs/images/start times
and restart counts must match the initial snapshot. The code does not read
container environments, database records, customer data or credentials.

Readiness metadata covers pg_dump version only, free disk, available memory,
Python/memfd API presence, AWS CLI presence, runtime role name and current photo
bucket versioning. CLI presence/API presence are not working-service proofs;
effective backup-prefix upload/recovery permissions are not established.
The existing photo bucket is not selected as the backup destination.

Eight tests cover exact certificate install/retry, private/extra PEM rejection,
pin and date checks, directory/final-file symlinks, existing-file preservation,
unsafe directory permissions and environment-free service snapshots. Local
checks passed. Pull requests run these tests without AWS; only the fixed request
merged into main can use the existing OIDC/SSM operation identity and target host.

Live installation and metadata are recorded only after the actual operation
completes. Full production signing-key custody, dedicated off-host storage and
access, scheduling/monitoring, retention/RPO/RTO and real recovery remain open.
Stage 33 remains **NOT PASS**.
