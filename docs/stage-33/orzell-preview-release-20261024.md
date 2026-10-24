# ORZELL preview release — 24 October 2026

## Source and scope

PR #28 merged into the Stage 33 development branch at
`287f9f284e16a66bc84157cdbea7c8b6dc5ee11e`.
PR #29 then carried the deployed owner self-booking contract into source and
merged at `3b58da8028472c1fbc42c84ca1fe7312dbe3553c`.
The tested and packaged application revision is
`3be316d1b2458c49fde162147244aa8077a1f614`; the merged tree preserves it.
Stage 33 has not been merged into main or marked PASS.

The preview serves ORZELL customer and business screens, original emblem,
explicit booking and cancellation confirmation, care history and ledger views.
Invalid/past calendar dates are rejected before requesting availability.
Customer mode sends the validated `bookForSelf: true` contract; dual-role owners
cannot substitute a different customer or persist manager notes in this context.
Manager-selected customer booking and staff restrictions remain intact.

## Verified checks

- [Application review](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40073686180): SUCCESS; isolated browser customer/business journey.
- [Full regression](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40073686181): SUCCESS; 441 API tests, 16 Stage 33 integration tests, migrations, build, formatting, type checks, lint and platform JavaScript exports.
- [Native compilation](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40073686234): SUCCESS for Android preview APK and unsigned iOS simulator app. This is not iPhone installation or store acceptance.
- [Host inspection](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40073485016): SUCCESS; confirmed existing images and Compose paths before changes.
- [Host candidate build](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40073798670): SUCCESS; ten mobile source/asset files fetched from the fixed revision and checked by SHA256, offline typecheck/web export and no live service restart.
- [Gateway-only publication](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40074002433): SUCCESS; local HTML/bundle checks, public HTTPS/ORZELL/booking/date markers, both API readiness/CORS checks, and unchanged API/worker/database/secret-helper/admin start times.
- [Live Chromium acceptance](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40074118686): SUCCESS; real HTTPS/API login, discovery, no booking on slot selection, owner personal booking (HTTP 201), explicit cancellation persisted as CANCELLED, customer/business navigation, logout, and zero page runtime errors.

The live browser used generated @example.test credentials and a clearly labelled
synthetic salon. Its salon was returned to private/INACTIVE, appointments were
cancelled and refresh sessions revoked. No owner or real salon record was used.
Synthetic audit/account records remain; no database rows or volumes were deleted.
No photo, AI request, payment or notification was used.

## Active preview and rollback

Customer URL: https://preview.13-51-112-228.sslip.io/

Active gateway:
`sha256:be20529c1e0c9e1d8ab03109079d8e3c1d6b2acf85374a0e8155b3de2dfdf1a2`.

Previous gateway retained:
`sha256:00521d1995ea85e58a024c2561195e432e9481c5ce93d029b66eec490130acd2`.

Active gateway Compose env:
`/opt/epifiz/operations/orzell-application-20261024/publish.env`.
Rollback env in the same folder: `rollback.env`.
Both use the original Compose file and the existing
`/opt/epifiz/operations/booking-context-20261022/mvp.yml` override.
Only gateway was recreated; no migration, capacity, IAM or policy-flag change.

Publication code is in `infra/operations/publish-orzell-application.sh`.
It pins both image IDs and the API contract image, tests locally first and
restores the previous gateway on failed public checks. It is a one-time operation;
re-execution against a different active image is rejected.

## Native packages

Artifacts from run 40073686234 expire on 31 October 2026:

- Android: artifact 12552860667, `orzell-android-preview`; archive digest
  `sha256:70d8f2bdfdc538cfba7614be5e9baf5c556c15b4eca90c30d4fda4a525b1959d`.
- iOS simulator: artifact 12551818470, `stage33-ios-simulator`; archive digest
  `sha256:315c0f323e454bc4c064c68a9e291d19d11421f1a0077e381b56dd7f165854da`.

These digests are GitHub artifact ZIP digests, not inner APK/app digests.
The iOS archive is unsigned simulator output, not a physical-iPhone IPA.

## Remaining acceptance

1. Physical Android and iPhone journeys, photo picker and device permissions.
   Apple signing/distribution setup and final store identities remain necessary.
2. Real-photo analysis, follow-up question quality, PLAN and semantic matches.
   Synthetic fixture/provider connectivity evidence does not certify quality.
3. Final platform operator/contact identity, reviewed photo/consent and business
   verification policies and independent reviewer setup. Existing retention
   choices remain recorded in policy drafts; unreviewed flags stay closed.
4. Sustained production retention/erasure, monitoring and recovery acceptance.
   Existing isolated backup/restore and worker-recovery tests do not establish
   live production recovery or continuous operation.
5. Store release and Stage 34–35 remain pending Stage 33 acceptance.

This release establishes the new interface on the existing preview and its
synthetic live booking/cancellation journey. It is not a production/store launch.
