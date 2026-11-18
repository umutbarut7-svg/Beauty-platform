# ORZELL Everywhere: published service sharing

## Source and scope

This change is based on the delivered application branch
`codex/orzell-testflight-upload` at
`61f97f0ed996844917be036a77e36d9aad999a94`, rather than main's older mobile
placeholder. It carries the share-link contract from draft PR #148 into that
application. No main/recovery branch merge is required. Existing App.tsx,
original O/Z artwork, admin login, precision-safe money formatting, inventory,
B2B and appointment materials are retained.

The separate PR #148 formatting correction changes only its page and export
formatting. This application change supersedes that preview implementation for
delivery; do not merge both independently into production.

## Implemented

- HTTPS links target an exact business/service and optional staff profile.
  IDs are limited to 64 characters, matching existing API resource IDs;
  duplicate/unknown query keys, foreign origins and redirect parameters fail.
- `GET /discovery/shared-service` is public and rate-limited, with a dedicated
  minimal response. It is closed unless `ORZELL_EVERYWHERE_ENABLED=true`.
  A single tenant-scoped service lookup requires an active public business,
  active category, active bookable service and, when requested, an active
  bookable staff profile with an active assignment to that exact service.
- Public fields contain names, timezone, currency, current service price and
  duration, and verified staff-specific overrides. No email, phone, customer,
  appointment or photo data is projected. Missing/private/withdrawn/cross-tenant
  targets share the same unavailable error.
- The web page resolves on each request (explicit dynamic rendering and no-store
  fetch). It validates wire data and refuses HTTP redirects from the configured
  API. It uses the delivered original logo and existing theme styles.
- In business service setup, the optional share area prepares a verified preview
  and link. The merchant approves before opening the operating system's share
  menu, with a fresh publication lookup immediately before sharing. Changing
  business/service/staff remounts and clears the draft. The link remains selectable
  for manual copying.

## Configuration and rollout

All new flags default to false in `.env.example`. A reviewer must configure the
actual approved bare HTTPS web/API origins; no ownership or deployment of
orzell.app is assumed. Mobile share controls additionally require
`EXPO_PUBLIC_ORZELL_EVERYWHERE_ENABLED=true` and
`EXPO_PUBLIC_ORZELL_WEB_ORIGIN` at bundle build time. The server web page needs
`ORZELL_PUBLIC_ORIGIN` and `ORZELL_PUBLIC_API_ORIGIN`.

Enabling flags, provider connections, external posting, deployments, new binaries
and production writes are outside this source change. There is no new migration,
provider request, paid AI call, tracking cookie, attribution write or advertising
spend. Rollback is to leave the flags false and retain the existing release.

## Validation

Local validation of the combined application source passed 524 workspace unit
tests, workspace typecheck/lint/build, API integration TypeScript compilation,
admin production build and Expo web export. The page was verified as dynamic in
the production-build route list. Formatting was corrected and rechecked.
The isolated PostgreSQL/HTTP tests are added to the existing Stage 32 integration
command and must pass in CI before acceptance; local runtime PostgreSQL is not
available in this workspace. Existing physical/device tests were not repeated.

New tests exercise public HTTP through the actual auth guard, malformed/duplicate
queries, tenant mismatch, service/category/business/staff/assignment withdrawal,
current prices and staff overrides, minimal projection, default-off behavior,
wire-data rejection, trusted transport and merchant draft preparation. These
are generated fixtures, not real salon/customer observations.

## Still open

- Authenticated web booking and live availability, including price revalidation
  at submission, unavailable slots, success/cancel and business-side receipt.
  Existing availability/appointment endpoints remain authenticated.
- Public result/portfolio images require separate publication authorization;
  photo-analysis consent does not make a result public. resultId remains closed.
- Verified iOS/Android domain association, native routing, fallback and physical
  TestFlight/Android tests on an actual approved domain.
- Instagram/WhatsApp/Google and other official account scopes/adapters, provider
  authorization/revocation, attribution consent, QR and richer share cards.
- Remaining Stage 33 policy, independent review and operational acceptance gates.

The completed 15 November isolated recovery and exact temporary-stack cleanup
remain accepted and are not rerun. The later conversation records the care-history
result/"Kararsız" match as accepted; this continuation does not repeat it or
manufacture new physical evidence. This PR does not declare Stage 33 PASS.
