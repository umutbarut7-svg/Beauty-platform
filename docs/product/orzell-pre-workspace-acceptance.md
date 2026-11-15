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
