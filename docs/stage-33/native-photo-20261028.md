# Native phone-photo preparation

The owner selected a photo in TestFlight 1.0.0 (1031), but the app showed the original 5 MB/JPEG/PNG rejection and never created a visual session. The reviewed browser correction in #49 was deployed to the web gateway only; the installed native bundle still used its original size/type check.

This release candidate carries the reviewed browser preparation and upload feedback into the signed release branch and adds actual native preparation. Expo ImageManipulator decodes the selected local JPEG, PNG or HEIC, preserves its aspect ratio, resizes to at most 1600 pixels and writes a JPEG. The actual local input and output sizes and signatures are checked, rather than optional picker metadata. Inputs are bounded at 40 MB/64 million pixels and the final upload remains bounded at 5 MB. Failed compression outputs and the final upload cache file are cleaned up; the selected source is never deleted. Native image/context references are released after encoding.

Preparation finishes before the existing session or consent is replaced. Cancellation and rejected replacement files preserve the previous consultation. The iOS picker can download the selected iCloud asset and requests compatible image representation. Errors, preparation, upload and success are displayed beside the selection button. Analysis still requires its separate action and explicit consent; this change does not automatically send a photo for paid AI analysis. Server validation and the existing retention policy remain authoritative.

The two new direct native dependencies use exact versions compatible with the installed Expo 57.0.24 bundle: expo-image-manipulator 57.0.19 and expo-file-system 57.0.7. No framework upgrade is intended. The signed workflow now typechecks and tests the exact mobile source before native generation and before signing credentials are available.

## Validation

Fourteen native preparation tests cover large HEIC/JPEG/PNG input, output byte verification and compression fallback, oversized/invalid source rejection, excessive pixels, wrong encoder output, temporary-file cleanup and original-file preservation. These use injected native I/O and do not prove the OS decoder or Photos picker on a physical iPhone. Browser regression, native compilation and signed-upload results are recorded below against the reviewed candidate and release merge.

Install the newly processed TestFlight build before repeating the owner's real-photo selection. A successful upload must show `Analize hazır` and the separate `Görsel analizi başlat` action. Apple processing, actual owner-device upload/analysis, recommendation quality and the remaining Stage 33 acceptance gates must not be inferred from unit tests or compilation. This is an internal TestFlight update, not an App Review or public store release.

Implementation references: https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/ and the pinned Expo FileSystem/ImagePicker package declarations. The original ORZELL logo and release bundle identity are retained.

## Internal iPhone update — 28 October 2026

The reviewed candidate `37c23524c6933ec9c8269bdcd52fd52169b2c13f` was merged through [PR #50](https://github.com/umutbarut7-svg/Beauty-platform/pull/50) into the existing TestFlight release branch at `e5716428050f6ceccb7a2aeef7fdfbdd122c5e4a`. Main application release acceptance remains separate.

Verified exact-candidate evidence:

- [Regression 40600513316](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40600513316): successful. 441 API unit tests, 31 governance tests, 5 database governance tests, all 16 Stage 33 HTTP/database/browser/storage/worker integration tests, migrations, workspace build/tests/typecheck/lint/format and both mobile bundle exports passed.
- [Application review 40600512766](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40600512766): successful. 32 mobile/client tests and Chromium/WebKit photo preparation, actual FormData payload, metadata removal, consent, replacement and withdrawal checks passed. These browser checks use synthetic pixels and mocked APIs.
- [Native compilation 40600512764](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40600512764): Android release APK and unsigned iOS simulator compilation both successful.

[Signed upload 40651903368](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40651903368) succeeded for release merge `e5716428050f6ceccb7a2aeef7fdfbdd122c5e4a`. The exact release passed mobile typecheck and all 24 mobile tests before native generation. ORZELL `1.0.0 (1041)` was archived for physical iOS devices, passed code-signature verification, exported to an App Store signed IPA, passed Apple validation and received upload acceptance on 28 October 2026 at 07:51 UTC (10:51 Türkiye). The temporary signing credentials and keychain were removed successfully.

[Apple processing and existing-group access 40652568164](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40652568164) succeeded. Apple reported the exact build `1041` as `VALID`, and its association with the existing `ORZELL iç test` group was verified. The internal state was `IN_BETA_TESTING`. No tester, invitation or group was created or changed. The existing Apple-operating-system-only encryption exemption was recorded for the reviewed photo preparation dependency inventory; no App Review or public release was requested.

On the owner's iPhone, update ORZELL through TestFlight to `1.0.0 (1041)` before repeating photo selection. The real device must show the upload success message and a separate analysis action. Real-photo analysis, question/plan/matching quality and all remaining Stage 33 acceptance decisions remain open.
