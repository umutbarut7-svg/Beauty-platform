# Same-plan matching refresh: bounded preview publication

PR #82 application source: `f712d06427092211d11c28d862365283d79f26e1`.
Application review 41811840820 and full API/HTTP/PostgreSQL/worker regression
41811840991 passed. Physical-phone and final native gates are separate.
The previously completed consultation remains a saved NO_MATCH until the owner
explicitly requests a fresh search after deployment.

## Immutable source and package

PR #83 rehearsal harness: `bb3f1e26b8616ce0c86633867674cef5c62f4bac`.
Image rehearsal 41811884318 and repository gate 41811883803 passed.
Artifact `matching-refresh-release-41811884318`, ID 13313350527, expires 7 November 2026
at 13:08:05 Istanbul.
ZIP bytes: 771732268; digest: `sha256:2b9a4b008973dc0809c93dd6fb6943d1309330d7d10ec02316bb764da8eb291c`.
Image archive bytes: 771729356; SHA-256: `57e661f70febea86b0cefd0d3aa63ae0cc56ed5466bbe76a446731e28ad497a1`.
API/privacy-worker image: `sha256:6370a6ed976c6b074c001e7c6db84156443c988f3d53342cde32cdd7e6e46936`.
Reproduction migration image: `sha256:90449f2f64f6061993051b00be6dc989c8f41932cf5f065a58e3ebcc9ad24616`.

The inspected prior API/worker image is
`sha256:d2b7ae718ad2ad78aa2ce4700646b4e37f3b861f0b39362e47af47219f11b5b6`.
This operation verifies that baseline and each service's own Compose inputs,
configuration hashes, quotas, paid-window closure and empty indexing queue.
Candidate and applied migration inventories must be exactly equal.
No migration is executed.

## Execution and acceptance

Use only the existing trusted-main OIDC/SSM role and preview instance, serialized
with existing operations. Pin every artifact/source/image/hash/size identity,
verify ZIP inventory and API/worker synthetic evidence, then apply image-only
overrides. Verify the worker first, API second, eight exact compiled module hashes,
unchanged schema, original environments/security settings, worker stability,
readiness/CORS, and unauthenticated rejection of both reads and the new refresh
POST. Preserve unrelated container identities and restart counts.
Rollback keeps the verified new cleaner after a candidate API start attempt.
Existing one-time operation directories cannot be replayed.

Nineteen local offline tests passed. They cover corruption, source/expiry,
schema immutability, configuration drift, sequencing, unauthenticated probes,
preparation failure and rollback. CI repeats on the runner and Python 3.9.
Actual publication is pending until exact candidate gates and this PR's checks pass.

No paid provider request, catalog indexing, key/model/quota/retention change,
customer-content inspection, new tester or store submission occurs here.
The existing web gateway/admin remain on their own sources; the new mobile UI
requires its subsequent internal TestFlight build. Full Stage 33 remains NOT PASS.
