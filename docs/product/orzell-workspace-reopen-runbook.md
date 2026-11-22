# ORZELL Everywhere: workspace reopening runbook

## Start with evidence, not assumptions

1. Fetch PR #148 latest head and compare with the delivered TestFlight source/ref. Never replace the delivered mobile app from main's placeholder entrypoint.
2. Inspect the **latest** Stage 32 validation workflow on PR #148. Previous runs do not prove the current head. Confirm `pnpm format:check`, shared types build, unit tests, API tests, admin typecheck/build and all required jobs.
3. If formatting fails, run `pnpm exec prettier --write apps/admin/app/discover/service/page.tsx packages/types/src/everywhere-link.ts packages/types/src/everywhere-link.test.ts packages/types/src/index.ts` on the PR branch, inspect diff, then commit.
4. Run `pnpm --filter @beauty-platform/types build` and `pnpm --filter @beauty-platform/types test`. The share contract has strict origin and ID checks; verify the latest added test is included.
5. Run admin checks and inspect runtime `ORZELL_PUBLIC_ORIGIN` value. Never assume ownership or deployment of orzell.app.

## Functional implementation sequence

1. Add a public **published-only** service-detail resolver that verifies business ownership, service publication, professional membership and approved public result image. Do not expose private/unpublished records.
2. Make the mobile web landing resolve that verified record; show live price/duration/currency and clear unavailable/expired states. No mock values or raw IDs as a customer-facing final UI.
3. Confirm whether public availability is allowed by the auth guard. Existing `GET /businesses/:businessId/availability` is not decorated `@Public()` in the controller; do not bypass authentication. The URL's `professionalId` must be mapped to a verified `staffMemberId`.
4. Implement approved authenticated booking handoff or explicitly reviewed guest booking. Existing `POST /businesses/:businessId/appointments` uses current user. Recheck price and availability server-side at submission and handle conflicts.
5. Add negative tests for cross-tenant IDs, private service/result, deleted staff, stale price, unavailable slot, duplicate params and unapproved redirect destinations.
6. Test social-post link → mobile web → service → availability → login/guest decision → booking confirmation → business dashboard. Record screenshots and API trace with no customer secrets.
7. Verify Universal Links / Android App Links and physical iPhone TestFlight with actual signed build, verified domain association and fallback when app is not installed.

## Stage 33 / recovery release gate

- Reconcile PR #141 isolated restore evidence against production requirements. An isolated restore is not production recovery authorization.
- Confirm latest TestFlight build, actual release commit, Apple acceptance and customer/business flows on device.
- Obtain explicit approval for production restore/reopen, new paid services, provider authorizations, and public release.
- Preserve locked original O/Z ORZELL logo and approved dark/light palettes.
- Keep PR #148 draft until all required gates are verified.

## Status at drafting

- GitHub Actions run 370 was still in progress when inspected; its outcome is not asserted.
- This runbook is preparation, not a claim of functional API integration or successful deployment.
