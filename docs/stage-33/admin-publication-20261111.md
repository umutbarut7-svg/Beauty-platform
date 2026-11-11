# Admin-only preview publication — 11 November 2026

The delivered application now has the reviewed /login, brand and ledger-display
fixes. Its merged source is 61f97f0ed996844917be036a77e36d9aad999a94, tree
20e98849b6e0c8ac29a00132c60b2cc04f6aac34. The five existing application gates on
94b6dd25a158cdd475e3b8005f8d263561304bf3 passed; they are checked without reruns.

PR123 builds only the admin. Successful credential-free container rehearsal
43051974621 at harness 587548a67549c54d47046a779cf382726f2cfd77 verifies both
entry routes, the original logo bytes, the real HTTPS API address and the client
role guard in a networkless, portless, non-root 256MiB container. Image:
sha256:2a8bed2e62811748b09c9bf88e46a16bdd76ad56e0cc13f1463a419ed38b9ab4.
Artifact 13869596962 has ZIP SHA256
e3c3b6de937ea452cc094b3b482c420bf950327074cba5331477c371356e2894;
254897412 bytes. Its manifest and image archive are pinned in the release request.

The publisher uses only the existing Stockholm preview role/instance and shared
preview operations concurrency. It verifies immutable artifact identity, expired
or failed gate denial, exact application/manifest binding, sufficient disk space,
the original admin Compose hash/image and service snapshots. The sole allowed
configuration delta is the admin image. The original Compose files, security and
process settings are preserved. The candidate and rollback both use immutable
image IDs and `up --no-deps --no-build --pull never admin`.

Live acceptance checks / and /login, the exact logo, the admin runtime and API
health/CORS; API, worker, PostgreSQL, gateway and secret-helper identity, image,
start and restart counts must remain unchanged. A candidate failure restores the
old admin image only and verifies it. An interrupted or failed operation cannot
be blindly replayed. The private artifact URL is transported in SSM input and
never printed. Verified temporary ZIP/tar files are removed after completion;
the previous admin image and rollback description remain available.

Eleven local boundary tests cover request/artifact tampering, incorrect source,
unsafe configuration changes, unrelated restarts, corrupt archives, preparation
failure, rollback after failed candidate health, interrupted-operation denial
and private-envelope bounds. These tests do not claim a forced live rollback.

This release has no API/worker migration, stock/order/payment mutation, provider
request, IAM/resource provisioning, TestFlight upload or App Store submission.
Actual production restore, physical-device quality and the remaining Stage33
product/privacy decisions are independent open acceptance gates.
