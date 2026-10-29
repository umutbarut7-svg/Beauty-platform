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

These are synthetic tests. No current user consultation has been read and no new
paid model request has been made. Live deployment, another signed TestFlight
build and physical-phone plan/match quality acceptance remain separate steps.
The already completed booking scenario is recorded in PR #54 and is not reopened
by this source proposal. Full Stage 33 remains open.
