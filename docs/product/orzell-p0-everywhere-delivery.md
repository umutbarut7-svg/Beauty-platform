# ORZELL P0 delivery decisions — Everywhere + product completion

Status: **approved product direction; implementation and acceptance pending**.

## Non-negotiable product decisions
- Preserve the approved original O/Z monogram and ORZELL wordmark. Light: warm ivory, champagne, beige, subtle rose-gold and lavender; dark: black, metallic purple and lavender.
- Business experience: five main navigation areas; simple/pro modes; booking, service/staff catalog, CRM, stock, cash/POS/bank reconciliation, finance, AI, ads and B2B. Keep advanced complexity behind progressive disclosure.
- Customer experience: discovery, portfolio, provider, service, staff, transparent price and availability, booking. Guest browsing and web booking without forced app installation.
- **P0 acquisition loop:** external content -> unique ORZELL HTTPS link -> exact service/portfolio/staff -> web or installed app -> booking -> consent-based attribution.
- Business connects professional Instagram/Meta, Google Business Profile, WhatsApp Business, TikTok, YouTube only through supported official permissions. One-time onboarding; auto-prepare service links, require merchant approval before supported external publication. No unsupported injection of custom buttons into third-party interfaces.
- Instagram: profile/Story manually placed link, messaging and eligible ads; do not assume organic feed/Reels clickable overlay or automated link sticker. TikTok: eligible business destination links subject to region/account. Google: supported booking/website URLs, never replace native Call button. WhatsApp: opted-in link cards/templates. YouTube: channel/eligible long-form link surfaces; Shorts restrictions.
- Use iOS Universal Links, Android App Links, HTTPS mobile-web fallback, app-open/install options; preserve destination where supported. Accessible, fast and localized.
- First vertical prototype: one real hair-coloring result from shared content through web/iPhone to a test booking; reuse vertical-neutral model for nails, dental and aesthetics only after legal/privacy review.

## Execution order and gates
1. Audit current branches, open PRs, CI, Stage 33 physical-device and backup/recovery acceptance. Avoid duplicate work; do not interpret a PR description as independently verified production acceptance.
2. Verify service catalog, specialist, booking and mobile-web landing are functional.
3. Implement canonical link registry, routing, attribution, provider-independent share card and business approval UI.
4. Run end-to-end web + physical iPhone test, verify link reaches the correct service and booking.
5. Integrate supported official provider APIs in stages; implement consent/revocation, webhook signatures, tenant isolation, rate limits and audit trail.
6. Extend categories and run accessibility, security, privacy, payments and release readiness tests.

## Approval boundaries
No paid service, ads spend, external account authorization, public posting, production deployment, production restore or destructive action without explicit approval.

## Tracking
- #144 universal discovery and deep links
- #145 first hair-coloring prototype
- #146 provider capability matrix
- #143 integration program

This document records durable priorities; it is not a claim that the features are shipped.

## Repository audit checkpoint (2026-11-16)
- Default-branch `apps/mobile/App.tsx` still contains a minimal Expo placeholder screen. This is **not** evidence that the TestFlight delivery lacks features: release work exists on separate PR branches; inspect the actual delivery commit and merge graph before modifying the mobile app.
- Default-branch `apps/mobile/package.json` has Expo/React Native without an obvious dedicated navigation or linking package. Do not assume native universal links are already implemented or absent across other branches.
- Open PR #141 describes successful isolated backup restore and scoped cleanup, but explicitly keeps `productionRestoreVerified`, `realRecoveryReady` and `productionReopenAuthorized` false. PR #142 is a separate draft clipboard diagnostic. Do not conflate isolated restore success with Stage 33 final acceptance.
- Open PR #109 concerns account erasure and governance; ensure link attribution respects erasure, consent and tenant isolation.
- PR #77 visual consultation matching and subsequent delivery history must be reconciled against current release candidate before creating new visual matching code.

**Next implementation handoff:** identify the exact current TestFlight/mobile delivery ref, API release ref, and web booking route; then implement one provider-independent share URL and mobile-web landing on top of those refs. Require a real device click-through test and a test booking receipt. Avoid building against the placeholder `main` mobile entry point without integration review.
