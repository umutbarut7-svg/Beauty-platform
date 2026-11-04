# Visual service compatibility: isolated release preparation

The application candidate is PR #77 source `04009b390d014431fe0d4fd99c965e2ce134fa20`.
It adds a bounded hair-service compatibility check and a clarification notice.
The server currently runs the saved-matching release from
`4fdfbe61405633ce85764c0b2a13e157bc9e5833`; TestFlight 1.0.0 (1111) remains the last verified phone delivery.
The candidate has not been deployed.

## Build scope

This separate workflow preserves the earlier saved-matching rehearsal unchanged.
It builds API and migration images from the exact pinned candidate with the
existing Dockerfile pinned to Git blob `57401f445e071f03adb0b73f5a94e581379b1275`.
It applies migrations only to a disposable PostgreSQL database and starts both
API and privacy worker on an internal Docker network with AI, semantic, S3 and
Redis flags disabled. It has contents-read permissions only, no cloud identity,
and no server or TestFlight commands.

Both processes must pass readiness/authentication checks and the same generated
Prisma/database/module verification. The compiled compatibility module is hashed
and six direct assertions cover haircut/extension conflicts, a consistent haircut,
unrelated/compound services and eyelash extensions. No provider request is made.

Only release images, checksums and synthetic evidence are retained for one day.
Record the actual workflow run, artifact ID, archive digest, image identities and
all application CI results before proposing publication. The migration image is
included for consistent reproduction; this application candidate adds no migration
and does not authorize applying migrations to the running server.

## Subsequent publication

Prepare a separately reviewed, bounded server update using the actual immutable
artifact and observed current API/worker baseline. Preserve service environments,
quotas, retention, host/network/security settings and unrelated containers.
Do not reuse the earlier one-time publication request, assume the old artifact,
or rerun the previous schema change. Verify both processes and then deliver a
new build only to the existing internal TestFlight group after authorization.

No new paid AI test, key/model/quota change, catalog reindex, tester addition or
public release is included. Existing physical-phone recovery acceptance remains
valid; service/photo quality, Android, product/policy/operations acceptance and
Stage 33 overall remain open.
