# EPIFIZ — Working brand foundation (21 October 2026)

Status: **visual direction approved; trademark/domain clearance outstanding**. This document defines a design direction, NOT legal clearance or production rollout permission.

## Naming and product scope

- Primary international wordmark: **EPIFIZ**. Turkish verbal presentation: **Epifiz**.
- Product: beauty, health, sport and AI super-app. Avoid a salon-only brand identity.
- English descriptor: Beauty · Health · Sport · AI.
- Working message: Higher wellbeing for a brighter tomorrow. Marketing copy, not a medical claim.
- Keep all existing service, package, API, database, auth and deployment identifiers untouched until a separate reviewed migration plan is approved.

## Visual tokens (design direction)

| Token            | Hex       | Role                          |
| ---------------- | --------- | ----------------------------- |
| `brand.midnight` | `#0E0F1A` | Dark canvas, main text        |
| `brand.violet`   | `#8B6CFF` | Primary accent, selection     |
| `brand.lavender` | `#DCCBFF` | Secondary accent, backgrounds |
| `brand.silver`   | `#C8CBD6` | Borders, secondary details    |
| `brand.paper`    | `#FAFAFC` | Light canvas                  |

Ensure WCAG AA text contrast on actual surfaces; violet is not automatically appropriate for small text on white. Provide dark/light variants, clear focus rings and reduced-motion behavior.

## Logo direction

- Wordmark: restrained uppercase geometric sans-serif, generous tracking; no unlicensed font dependency.
- Symbol: a geometric abstract convergence/radiance emblem derived loosely from pineal awareness, without literal eye/brain, healthcare cross, scissors, or beauty salon imagery.
- Must work at 24px and in single-color black/white; avoid relying on gradients or glows at small sizes.
- Application icon: standalone emblem centered in a dark, generously padded rounded-square field.
- Current generated brand boards are **visual references only**, not production-ready SVGs, licensed typefaces, or legally cleared exclusive artwork. Reconstruct and review final vector asset before shipping.

## UX integration boundaries

1. Create design tokens in shared frontend layer without changing existing domain logic.
2. Preview branding in Expo customer/business apps and Next.js operator interface behind reviewable changes.
3. Keep booking/result/satisfaction and tenant governance authoritative.
4. Never enable AI/photo/verification/payment rollout flags as part of a branding change.
5. Verify localization, contrast, icon legibility, responsive layout, and screenshots before merging.

## Release blockers

- Confirm trademark conflicts/clearance, target Nice classes and legal entity.
- Confirm registrar ownership/availability for preferred domains and social handles.
- Complete Stage 33 gated acceptance independently. No branding deliverable implies Stage 33 PASS.
- No production rename, domain switch, migrations, or billable cloud creation without separate review.
