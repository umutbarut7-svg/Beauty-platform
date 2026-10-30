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
Private reads and matching responses use Cache-Control: no-store.

The selected recommendation's service ID now travels into the authoritative
catalog. The matching service is selected when still bookable; a missing
recommendation produces an explicit notice and no replacement selection. The
user can deliberately choose another current service. This corrects the handoff;
it does not establish that the AI's original recommendation was appropriate.

An additive migration adds three nullable analysis fields. Existing analyses
have no saved match; this cannot reconstruct earlier responses that were never
stored. A process interruption can leave RUNNING until the consultation expires;
reads never reclaim it or launch another potentially paid request. Provider
failures are recorded as FAILED; only a later explicit POST can try again.
This is completed-result replay and concurrency protection, not a guarantee of
exactly-once upstream billing through network failures.

Validation is prepared in the existing real PostgreSQL/HTTP/provider-double and
intercepted Chromium/WebKit gates: restart replay, NO_MATCH, concurrent claim,
owner/policy/expiry/revocation checks, in-flight withdrawal, scrub, current
catalog revisions, no automatic retries, recovery failures and exact service
handoff. No live provider request, quota change, policy activation, catalog
reindex, production migration or binary upload has been performed for this
candidate. TestFlight 1101 remains the last verified delivered build. Full Stage
33 remains open pending actual candidate gates and remaining physical-device,
result-write, provider-quality, policy and operational acceptance.
