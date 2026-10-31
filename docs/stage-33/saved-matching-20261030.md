# Recover completed matching without repeating provider work

The owner demonstrated a stored consultation plan and the 31 October 09:30
Kaynak appointment's pending detail on the physical iPhone on 30 October 2026.
Those screenshots establish those reads. The source photo and the morning's
professional recommendation screenshot are unavailable, so recommendation
relevance, source-photo fidelity and installed-build attribution remain open.
Existing booking, approval and cancellation acceptance is not reopened.

The previous mobile correction retained matching only within one mounted
screen. This candidate adds a completed snapshot to the existing owner-scoped
photo analysis. MATCHED and NO_MATCH replay without another embedding, including
after server or app restart. A GET reads saved status; it never analyzes,
embeds, indexes, consumes provider quota or retries a POST. The app blocks a
new search until a recovered consultation's saved status has been read.
An in-flight durable claim prevents concurrent provider requests for that plan.

The snapshot stores service/business references, similarity and source revision
timestamps, without names, prompts, photos, tokens or provider bodies. Every
read rechecks the authoritative owner, current reviewed policy, active photo
and consent and existing expiry. It also revalidates public, active, bookable
catalog entries and their exact source revisions; changed/private services are
excluded and current public names are projected. The expiry is not extended.
Consent withdrawal and the existing expiry worker scrub the matching fields.
The worker also clears matching fields on already quarantined/expired rows,
without changing their revocation state or repeatedly rewriting scrubbed rows.
Private reads and matching responses use Cache-Control: no-store.

The selected recommendation's service ID now travels into the authoritative
catalog. The matching service is selected when still bookable; a missing
recommendation produces an explicit notice and no replacement selection. The
user can deliberately choose another current service. This corrects the handoff;
it does not establish that the AI's original recommendation was appropriate.

An additive migration adds three nullable analysis fields. Deploy the reviewed
API and privacy worker together before client delivery. Older analyses have no
saved match; this cannot reconstruct earlier responses that were never
stored. A process interruption can leave RUNNING until the consultation expires;
reads never reclaim it or launch another potentially paid request. Provider
failures are recorded as FAILED; only a later explicit POST can try again.
This is completed-result replay and concurrency protection, not a guarantee of
exactly-once upstream billing through network failures.

Validation passed on reviewed head `b6fbde63c07ebc477f1d721342a29c743c8e8b9b`:
441 API tests and 23 real PostgreSQL/HTTP/worker/provider-double integration tests,
39 client tests, intercepted Chromium/WebKit journeys, Android/iOS native
compilation and the synthetic native photo runtime. Merge
`4fdfbe61405633ce85764c0b2a13e157bc9e5833` has the identical reviewed tree.

## Verified preview and internal delivery, 31 October 2026

The owner approved the three-column migration, coordinated API/privacy-worker
update and subsequent internal TestFlight delivery. The first preparation stopped
before service changes because the host Python 3.9 lacks `hashlib.file_digest`.
Read-only inspection verified the original healthy services, untouched schema
and exact complete archives. Portable hashing and bounded verified preparation
recovery passed 15 offline behavior tests under both the runner and Python 3.9.

[Publication 41183306801](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41183306801)
completed successfully at 11:09 Istanbul. SSM
`ca9f4b14-5cc3-4b9e-ade4-a53dc7ae1f1c` verified the additive migration, identical
API/privacy-worker image
`sha256:8d47e73a44a5e2d1ec7df3a54c8feaeb315271c819a8e3217237745d62206225`,
generated fields/module fingerprints, preserved configuration, health/CORS,
authentication rejection and unrelated-service isolation. No rollback was needed.

[Signed upload 41183547067](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41183547067)
delivered ORZELL 1.0.0 (1111), source
`23fd58c43308721900454da45c3eafddfb7a548d`. Only the upload workflow's introductory
comment differs from the reviewed application. Apple accepted the binary at
11:19 Istanbul; temporary signing credentials were removed.

[Existing internal access 41184287109](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41184287109),
source `2da1f98380d23cbd0625d50ca7d082f7763d8501`, verified `VALID` and
`IN_BETA_TESTING` for the existing `ORZELL iç test` group at 11:22 Istanbul.
The unchanged dependency/HTTPS/encryption inventory was compared with build 1101
before reusing the reviewed operating-system-only exemption. No tester/group,
external testing, App Review or public release was added.

This delivery did not request a new paid analysis/match, quota/key change or
catalog reindex. Prior unstored recommendations cannot be reconstructed.
Physical installation and remaining result-write/photo-quality/policy/operational
acceptance remain open. Existing booking/approval/cancellation evidence is
preserved; full Stage 33 is not marked PASS.
