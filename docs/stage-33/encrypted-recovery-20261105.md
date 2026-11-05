# Authenticated encrypted recovery preparation

The previous offline photo quarantine predates the saved matching columns now
delivered in TestFlight 1151. Its SQL does not clear `matchingStatus`,
`matchingRequestId` or `matchingOutput`. The new current-schema quarantine clears
those fields as well as the original consultation content. It retains the same
offline/database acknowledgements, transaction, evidence expiration and
idempotent invalidation events. The historical SQL and its older acceptance
workflow remain unchanged.

## Prepared implementation

`infra/operations/encrypted-backup.py` uses OpenSSL CMS AuthEnvelopedData with
AES-256-GCM and a separate RSA-3072-or-stronger recipient certificate. Data-key
transport uses RSA-OAEP with SHA-256. This is the standard CMS format, with no
custom ciphertext container. Encryption needs only the public certificate;
decryption requires the private key and optionally a protected passphrase file.
The private key must belong to the current user and have no group/other access.

Decryption rejects unauthenticated CBC EnvelopedData. It writes a private
temporary file and publishes the destination only after OpenSSL successfully
authenticates the complete message. Existing paths and symlinks are never
overwritten. Files use mode 0600; publication uses a no-overwrite hard link and
file/directory fsync. Failed transforms remove temporary files. There is no
database, network, cloud, scheduler or service-management capability in the tool.

The isolated workflow pins application
`2e56def282c97a804a2f3d6c9b36a53b42a09df5`, the tested application source for 1151. It performs actual pg_dump, encryption, authenticated decryption and
pg_restore into a separate disposable PostgreSQL database, both before and
after a consent withdrawal. It uses compiled application read/withdrawal queries
and two actual privacy-worker processes with local synthetic storage. Fixture
product decimals, stock movement/receipt JSON, supplier and quote snapshots must
survive restore and privacy cleanup unchanged. The receipt is a synthetic
immutable JSON snapshot; it does not claim a new live appointment acceptance.

The old-snapshot branch demonstrates the missing withdrawal while offline, then
requires acknowledged quarantine. Missing/wrong acknowledgements are rejected.
Quarantine replay and cleanup must clear saved matching data without fabricating
user-withdrawal events or extending audit expiration. All keys, dumps and files
are temporary fixtures removed in finally; only non-content evidence is uploaded.

Local tests cover successful streaming round trip, private file permissions,
randomized encryption, ciphertext corruption, truncation, wrong key, existing
output, input/output symlinks, weak recipients, unsafe key permissions,
unauthenticated CBC and password-protected keys. Actual CI conclusions belong
to the associated pull request and must be inspected before claiming acceptance.

## Production boundary

This prepares and tests a recovery mechanism; it does not establish automated
encrypted production backups. The encryption recipient must be independently
pinned by certificate fingerprint and its private key held outside the source
host and backup store. Fixture keys must never be reused. Durable off-host
storage, approved backup retention, recovery objectives, monitored schedules,
failure alerts and an independently demonstrated key recovery remain open.

Authenticated encryption detects corruption; it does not prove who created a
backup, its freshness, completeness, source revision or business authorization.
Those facts require an independently trusted manifest and recovery review.
CMS is not an archive sandbox: pg_restore must run only in an isolated disposable
target with controlled credentials and no serving application or provider access.

The fixture harness holds its small dump in memory. The encryption CLI also
supports stdin for a future bounded-memory producer, but producer exit status,
pipefail, resource limits and interrupted-job cleanup require separate operational
integration. Decryption deliberately requires a seekable regular input file.
Temporary plaintext can survive a host crash or SIGKILL; a real recovery needs
approved encrypted ephemeral storage, access controls and crash cleanup.

There is no production backup upload, live database read/restore, bulk consent
invalidation, account deletion, API/worker rollout, TestFlight package or paid
provider request in this change. Restored authentication/account-erasure history,
cloud-object isolation/absence and independent durable withdrawal reconciliation
remain separate gates. The draft account-erasure PR #47 is not silently merged.
No recovered system may reopen based solely on this test. Stage 33 remains
**NOT PASS** until its other factual product, device, privacy and operational
acceptance points are completed.
