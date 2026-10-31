# Approved saved matching preview publication

After #72's successful read-only inspection and #73's successful isolated image
rehearsal, the owner explicitly approved: merging #73, adding the three nullable
matching fields, updating the API/privacy worker, and subsequently delivering an
internal TestFlight build. #73 merged as
`2c7492871f6eb6fd9eb1f92970fe73cc95467122`.

This execution package implements the server portion of that approved sequence.
It uses the existing preview OIDC role and fixed EC2 target, with no IAM or key
changes. Main-only execution verifies artifact `13034118862` from successful run
`41179806354`, its exact source head and digest, and sends a bounded private SSM
command. The transfer URL is not written to CI logs, repository files or output
artifacts. PR checks have no cloud credentials and do not publish anything.

On the host, verify both known live image IDs and each service's original Compose
inputs, readiness, unchanged quotas and restored paid-test window. Verify the
archive and image digests, historical migration checksums and the one new nullable
field migration. Drain/stop the API and worker, recheck the paid indexing queue,
apply the reviewed Prisma migration, and verify the worker before starting the
new API. Verify generated Prisma/module fingerprints, configured environment,
host/security settings, readiness/CORS, authentication rejection and unrelated
service isolation. No real user/session/photo request is used for verification.

Failures retain a root-owned operation record and prohibit blind replay. Before
any candidate API can run, the old API and worker may be restored while keeping
the additive schema. After a candidate API start is attempted, revert the API
first and retain the verified new privacy worker; the old cleaner must not leave
new derived fields without expiry handling. Failed or uncertain rollback requires
inspection, not automatic repeated migration or provider work.

The publisher does not request AI analysis/matching, change quotas/credentials,
seed/reset a database, reindex a catalog, change retention, add testers, upload a
binary or submit to App Review. The existing internal TestFlight delivery starts
only after this server operation actually completes and verifies successfully.
Full Stage 33 and outstanding physical-device/result-write/quality/policy
acceptance remain open.

Local validation: 13 offline behavioral tests cover exact artifact inventory and
digests, migration/config drift, no blind replay, unrelated service changes,
artifact expiry/source, the private envelope and privacy-preserving rollback.
The exact final PR head must pass these tests and repository regression gates
before merging to activate the fixed publication request.

## Inspected preparation failure and bounded recovery

The first approved publication, run `41182299660`, SSM command
`48f28489-d4cb-49a0-978e-2debf63343ed`, stopped in `PREPARATION_FAILED`.
The source used `hashlib.file_digest`, unavailable on the observed Python 3.9.25
host. The subsequent read-only #75 inspection, run `41182894441`, SSM command
`eb9aa3e9-363e-4e11-811c-21cf79e049e9`, verified both complete archive hashes,
no loaded candidate images, original healthy API/PostgreSQL and running worker
with zero restarts, no new matching columns and no failed migration. No service
transition or schema application occurred.

Use portable streaming SHA-256. Resume only this inspected pre-service failure
when source, previous images, exact original Compose commands and unchanged
schema all agree; refuse migration/service/rollback phases. Revalidate the exact
ZIP, image archive, manifest and evidence before reusing existing files. No
partial file is overwritten and no uncertain migration is replayed. The fixed
follow-up request is `orzell-saved-matching-publication-20261031-2`, retaining the
same operation journal, application source, artifact and images.

Fifteen behavioral tests include absence of `file_digest`, verified package reuse
without redownload and rejection of unsafe resume phases/schema/Compose drift.
CI repeats the tests under both the runner Python and a network-isolated Python
3.9 container matching the observed host's language version. Existing publication
guards and staged rollback are retained. Error reporting now exposes only the
controlled Stop reason or exception class, never raw private error bodies.
