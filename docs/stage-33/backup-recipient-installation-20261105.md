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

## Actual host installation

Source `fb5f8452a006a41b2167fac723591e3b9ae457c6` passed offline run
`42105465892` and general repository run `42105465446`. Merge
`0a5d9bc790f615fcb92e1efb5d9ceb173cc92c08` has the identical tested tree
`48f6aba14e9d8e75f4574f371e7feb4cc9387638`.

Main run `42105863087`, job `127520379779`, SSM
`a55185d3-8ea8-4f04-9745-8b6464f7805f`, completed successfully on 5 November 2026
at **23:42 Istanbul**: `PUBLIC_RECIPIENT_INSTALLED`, expected fingerprint,
privateKeyTransferred=false, backupStarted=false, serviceStateUnchanged=true.
pg_dump major 17, Python 3.9.25, memfd API present, AWS CLI present. Free disk was
6,300,635,136 bytes and available memory 791,851,008 bytes at that instant;
these are observations, not backup-size/capacity guarantees.

Runtime role: `BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh`. Existing photo
bucket versioning remained UNKNOWN under this runtime read. No backup prefix,
write permission or remote-storage readiness was inferred. The next storage
foundation is a separate owner-run proposal, not an expansion of the existing
GitHub operations role.
