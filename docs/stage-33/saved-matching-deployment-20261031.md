# Saved matching: prepared release and observed preview baseline

The owner explicitly approved merging #72 and running its read-only preview
preflight. Merge `cff3d9958d3f83bb96c2107a7b93835bc338cbbc` ran
[41179479444](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41179479444)
successfully on 31 October 2026 at 10:09 Istanbul. Readiness/CORS passed, there
were no unfinished failed migrations, the previous paid-test window was
`RESTORED`, and existing daily/global caps remained 5/20. No provider request,
customer-row read, migration, restart or deployment was performed.

The observed API image was
`sha256:22b333c13e5dd6de70027a93141aad0b4157be7c1fed4b29067a70173acc94a9`.
The worker image was
`sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe`.
Both use Prisma 6.19.0 and lack the three saved-matching fields. The database
lacks them too. API and worker have separate, previously reviewed Compose
overlays; preserve each service's own environment and rollback inputs.

## Exact candidate

Application source is the merged #71 commit
`4fdfbe61405633ce85764c0b2a13e157bc9e5833`, tree
`4fa2557d9a76c8bbff52468d17a1f4556bb10294`, identical to the tested #71 head.
The existing preview Dockerfile is pinned by its Git blob hash. The new
nonprivileged CI workflow builds API and migration images, applies all migrations
to an isolated disposable PostgreSQL, starts the API and actual privacy worker,
checks readiness and authentication rejection, and exercises both images'
generated Prisma metadata and real database reads of the new nullable fields.
The Docker network is internal and provider/storage flags are disabled. No AWS
identity or production credentials are available in this job.

After rehearsal, preserve the exact images, archive checksum and synthetic
evidence as a one-day GitHub artifact. This workflow has no deployment trigger,
OIDC permissions, server commands or TestFlight upload. Its artifact becomes a
release candidate only after the exact head's required checks pass. Record the
actual run, artifact ID, digest and image IDs before proposing deployment.

## Proposed controlled publication — separate authorization

1. Recheck the two observed image IDs, both resolved Compose configurations,
   previous-window restoration, empty paid-provider queues and current database
   migration state. Refuse drift or an incomplete earlier publication. Serialize
   with the existing preview-operations concurrency group.
2. Transfer the immutable CI artifact privately to the existing preview host;
   verify the GitHub artifact identity and archive checksum before loading images.
   Keep the original API/worker images and each original Compose command.
3. Verify the migration set adds only
   `20261030000000_visual_matching_recovery`. Apply its three nullable columns
   using the prepared Prisma migration image. Do not reset, seed, drop columns,
   extend retention or change existing row values.
4. Upgrade and verify the privacy worker first. Its generated Prisma client and
   cleanup code must know all three fields before the new API can serve requests.
   If this fails before any candidate API starts, restore the original worker.
5. Upgrade the API with the same prepared image. Preserve both services' current
   environment, quotas, host/network/security settings and unrelated containers.
   Verify image/module identity, health, CORS, unauthorized-read rejection and
   continuing worker operation. Do not invoke an AI endpoint to verify delivery.
6. If the candidate API has started and must be reverted, keep the verified new
   privacy worker so newly saved fields still expire and scrub. Do not blindly
   downgrade the worker, remove the additive columns or rerun an uncertain
   publication. Record a partial rollback for review.
7. Only after server acceptance, prepare the existing internal TestFlight
   delivery. No new paid AI test, new tester, App Review or public release is
   included. Physical-device/result-write/quality/policy acceptance remains open;
   this preparation does not make Stage 33 PASS.
