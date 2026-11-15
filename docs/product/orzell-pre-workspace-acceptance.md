# ORZELL pre-workspace acceptance checklist (2026-11-16)

## Verified from GitHub Actions

- Stage 32 run 365 (commit ec8fff4) failed at `pnpm format:check`.
- The shared Everywhere tests completed: **4 passing** in that run.
- Four files require Prettier: `apps/admin/app/discover/service/page.tsx`, `packages/types/src/everywhere-link.ts`, `packages/types/src/everywhere-link.test.ts`, `packages/types/src/index.ts`.
- Do not merge PR #148 until the **latest** commit passes all gates, including format, build, typecheck, unit/integration tests.

## Can prepare without a production workspace

1. Run repository Prettier against the four files and commit only formatting changes.
2. Verify exact deployed iOS source branch and release commit; avoid treating main's Expo placeholder as the delivered TestFlight app.
3. Audit existing public discovery endpoints and tenant-scoped published-service contracts before wiring the landing page.
4. Add integration tests: unpublished service, mismatched business/service, wrong professional, unapproved result, stale price, unavailable slot, duplicate query IDs and cross-tenant access.
5. Add a user-visible no-match/expired-link state and avoid implying booking confirmation without a successful backend response.
6. Prepare social platform linking with explicit merchant authorization, official API permissions and token revocation, without publishing or granting permissions.

## Requires connected environment or explicit approval

- Actual API/database integration, seeded test tenant and verified live booking transaction.
- iPhone/TestFlight Universal Links, app association, verified domain ownership, deep-link routing and physical device acceptance.
- AWS production recovery/reopen gates and evidence; no production restore, deletion or paid deployment without approval.
- Official Instagram/TikTok/Google/WhatsApp/YouTube account authorization and provider review.

**Release gate:** all required CI checks green, release ref reconciled, actual customer booking success/cancel path verified, security/tenant isolation validated, rollback ready, user approval for production rollout.

## Source-audited API contract (main branch)

- Public discovery endpoints: `GET /discovery/search`, `GET /discovery/businesses`, `GET /discovery/services`, `GET /discovery/professionals`, and `POST /discovery/match` in `apps/api/src/discovery/discovery.controller.ts`. Public reads have throttling.
- Existing availability: `GET /businesses/:businessId/availability` with `serviceId`, `staffMemberId`, `date`, optional `locationId`. **Not marked public** in controller; inspect global auth guard before calling from guest web.
- Existing booking: `POST /businesses/:businessId/appointments` uses `@CurrentUser`; **not a guest booking endpoint**. Do not wire unauthenticated share visitors directly to it or bypass auth.
- Important identifier mismatch: share contract calls the optional field `professionalId`, whereas availability uses `staffMemberId`. Resolve a verified staff mapping, never assume interchangeable IDs.
- Public discovery list response alone is not sufficient proof that a specific result/photo is authorized for display. A dedicated published-detail resolver is needed.

## Web landing acceptance

1. Validate IDs, then fetch published business+service details from a tenant-aware server resolver.
2. Validate staff belongs to same business/service and result has explicit public permission.
3. Handle missing, private, deleted, unavailable records without leaking tenant existence.
4. Display current price/duration/availability only from server-verified data, not query parameters.
5. Require authentication or a reviewed guest-booking flow before POSTing appointments; avoid false confirmation.
