# Resume an active consultation without repeating analysis

The owner completed the physical-iPhone booking, business approval, refreshed
customer status and cancellation checks on build 1061. The remaining customer
plan-to-matching acceptance needs an active consultation. VisualJourney currently
keeps its session only in component memory; leaving its screen or restarting the
app removes the UI's route back to a server-stored plan.

This correction adds an explicit authenticated read of the owner's active
consultations and a selection action that loads the existing session. Intent and
target are restored alongside it. Opening the list or a session does not create a
consent, upload a photo, analyze, embed or request matches. User choice remains
required for later AI actions. No localStorage, token persistence or longer
retention is introduced.

The list requires the current reviewed policy, owner identity on the analysis,
photo and consent, unexpired timestamps at each level, and an active photo and
consent. Revoked/expired sessions are excluded. It returns at most 20 bounded
summaries with deterministic ordering and no photo key, owner ID, output, answers
or provider credentials. The private response uses Cache-Control: no-store.
Selecting a listed row still uses the existing authoritative owner GET; a stale
list entry cannot reopen a revoked or expired session.

The UI discards late reads after unmount, replacement or withdrawal. Recovery
clears previous answers and matches and keeps the selected consent's withdrawal
action available. A failed selection preserves the current consultation; HTTP 401
uses the existing sign-out/reset behavior.

## Verification prepared

- Real HTTP/PostgreSQL coverage: missing JWT, cross-owner reads, ignored owner
  spoofing, analysis/photo/consent expiry, photo deletion, photo/consent
  revocation, policy change, terminal state, bounded history, safe projection,
  read-only behavior and withdrawal.
- Isolated Chromium and WebKit coverage: existing-plan and question restoration,
  intent/target restoration, screen navigation, reload and sign-in, stale row,
  expired session, withdrawal during a late restore, and zero provider actions.
- Existing application/photo/matching, API, integration and native gates remain.
  Formatting failures keep their gate and print the focused repair diff.

These are synthetic tests. No current user consultation was read and no new
paid model request was made by these checks.

## Delivery status, 29 October 2026

The API was published successfully in [PR #63](https://github.com/umutbarut7-svg/Beauty-platform/pull/63),
with healthy/authentication/CORS and module-integrity checks in
[run 40859059697](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40859059697).
The corresponding client recovery feature was delivered in internal TestFlight
1.0.0 (1071), then retained in 1.0.0 (1081) alongside the result-context correction
from [PR #64](https://github.com/umutbarut7-svg/Beauty-platform/pull/64).
For build 1081, signed upload
[40933567057](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40933567057)
and existing internal-group access verification
[40935043013](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40935043013)
both passed; Apple reported `VALID` and `IN_BETA_TESTING`.

## Physical iPhone recovery acceptance, 29 October 2026

The owner supplied physical-phone screenshots at 21:58 and 21:59 Istanbul time
after the guided TestFlight update. The active-consultation list displayed three
existing entries. Opening the first entry displayed
`Kaydedilmiş danışmanlık açıldı.`, `Danışmanlık durumu: Plan hazır`, the restored
analysis text, five recommendation steps and the plan-to-professional search
button. The owner confirmed the opening action. PASS: listing existing
consultations and restoring one saved plan on the physical iPhone.

The screenshots do not display the installed build number and do not establish
accuracy against the source photo, professional recommendation quality,
plan-to-matching, a new photo-picker/upload journey or result/satisfaction/passport
acceptance. No additional paid analysis or matching action is requested for this
recovery check.

Next physical step: open Randevular and identify a suitable completed test
appointment for result → satisfaction → Beauty Passport acceptance. Inspect the
actual list before creating or completing another appointment. Plan-to-matching
quality and Android physical acceptance remain open; full Stage 33 is not PASS.
Existing booking/approval/cancellation acceptance in PR #54 is not reopened.
