# Same-plan matching refresh: bounded preview publication

PR #82 application source: `f712d06427092211d11c28d862365283d79f26e1`.
Application review 41811840820 and full API/HTTP/PostgreSQL/worker regression
41811840991 passed. Android/iOS native builds 41811841113 and native iOS photo-runtime acceptance 41811840729 passed. Physical-phone acceptance remains separate.
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

The initial nineteen local offline tests passed. They cover corruption, source/expiry,
schema immutability, configuration drift, sequencing, unauthenticated probes,
preparation failure and rollback. CI repeats on the runner and Python 3.9.
The initial publisher's inventory-name error was detected before live service mutation; see PR #85 and the preparation-repair evidence below.

No paid provider request, catalog indexing, key/model/quota/retention change,
customer-content inspection, new tester or store submission occurs here.
The existing web gateway/admin remain on their own sources; the new mobile UI
requires its subsequent internal TestFlight build. Full Stage 33 remains NOT PASS.

## Completed code-only publication, 4 November 2026

Application PR #82 merged as 3be7eebba0792d3d015a72fbec8d05259ea93946 with tree 415b4d2fb684e21e55e8cbaebb23e01aecc7f54d, identical to tested f712d064 source. All four exact-source application/API/native/photo gates passed. PR #83 merged as c422d95f8acf6f4a5e522e1d50526733cd15ac9f.

Initial publication 41813561525 / SSM c6c514cb-68cd-4b59-b143-e81f26fb82f1 stopped PREPARATION_FAILED before image loading/service mutation because the expected compatibility-module name was incorrect. PR #85 corrects the expected inventory without altering application or package, makes regression fixtures read the independent rehearsal verifier, and requires the pinned prior pre-mutation failure record before a new bounded request. Safety 41814090663 (21 checks on runner and Python 3.9) and repository gate 41814090798 passed. Merge: 0b347b25a4b7b744002734b1ea53fa391f93538e.

Publication 41814426154 / SSM e4fc6700-7201-42ad-a6e8-7151b386bef1 completed Success / COMPLETED at 13:32 Istanbul. API and worker run the pinned 6370a6ed... image and exact f712d064 source. Eight compiled module hashes, Prisma fields, worker stability, original environments/security settings, unchanged schema, health/CORS, unauthenticated private-read and refresh-POST rejection, and unrelated-service preservation passed. No rollback was needed; no migration or provider call ran.

Only after server verification, signed iOS upload 41814987209 completed successfully from 12c7d33d29510ddb86ab81826fd474e4310a7784. The sole difference from the application merge is two release-provenance comments. Apple acceptance is recorded below; device install and live refreshed matching remain separately tracked. Do not repeat photo analysis or assume additional paid-operation authorization. Full Stage 33 is NOT PASS.

## Internal TestFlight acceptance

Upload 41814987209 / job 126523361296 identified ORZELL 1.0.0 (1131), validated and uploaded its signed IPA, and removed temporary signing credentials. Signed source: 12c7d33d29510ddb86ab81826fd474e4310a7784. Existing original logo, bundle com.orzell.app, Apple team and signing path retained.

Access workflow source a9950a633a2ec54cbf021bfbd83e60c441fbcf55, run 41815838988 / job 126526233793: success at 13:43 Istanbul. Actual Apple processingState VALID; existing internal group association verified, internalBuildState IN_BETA_TESTING. Unchanged dependency/lockfile/app identity/HTTPS/OS encryption inventory was compared with build 1121; the existing HTTPS-only exemption was recorded. No external testing, new tester/group or store release.

Pending: user installs 1131 and opens the same active saved haircut consultation. A single live refresh requires new explicit paid-search approval because prior analysis/search/indexing authorizations are consumed. Do not repeat photo analysis, silently retry a paid request, raise quotas or bypass retention. Source-photo fidelity, successful current-catalog recommendation, other Stage 33 policy/device/result/backup gates remain open. This release does not implement service icons, product inventory or B2B roadmap items.
