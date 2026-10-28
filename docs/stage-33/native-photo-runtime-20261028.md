# Native photo read and upload runtime correction

The owner's iPhone running TestFlight 1.0.0 (1041) showed both a generic connection error and photo upload failure. The policy and permission text had loaded. The exact installed Expo 57.0.24/FileSystem 57.0.7/React Native 0.86.3 source exposes two deterministic client failures before a valid photo upload:

- `File.slice()` builds a global Blob from a byte array. React Native's default Blob rejects ArrayBuffer/typed-array parts. The previous 64-byte header check therefore throws before encoding or consent creation; the generic application handler presents it as a connection error.
- Expo 57 installs its fetch by default. Its multipart converter rejects the URI-only React Native file descriptor previously appended to FormData. It accepts an actual Expo File through its `bytes()` method.

Header inspection now opens the file in read-only mode, reads at most 64 bytes and always closes the handle. Native read failures become a photo preparation error without exposing paths. Upload FormData carries the actual verified temporary JPEG File. No global fetch/Blob replacement, new dependency, server policy or API limit change is required. Existing normalization, consent, replacement preservation and cache cleanup remain in place.

The regression test first failed against the old adapter with the native Blob error, then passed after the correction. The installed Expo FormData patch and multipart converter reproduce rejection of the old URI descriptor and accept actual JPEG bytes from the corrected File adapter. The local mobile/client suite passes all 36 tests; mobile typecheck, changed-file lint and formatting pass.

The dedicated runtime workflow creates an ephemeral unsigned simulator app with a CI-only entrypoint and a loopback-only synthetic HTTP server. It uses actual native File IO, native ImageManipulator encoding, the default Expo fetch, MvpApiClient authorization and multipart serialization, JPEG decoding/dimensions/metadata checks, and temporary-file cleanup. Its local-network exception and probe entrypoint exist only in that disposable test build. No probe binary is published. Physical Photos-picker acceptance and real-photo analysis remain separate.

The first runtime attempts exposed test-environment boot latency and an overly broad EXIF assertion. Actual captured native output was a valid 1600x1200 JPEG with no original source marker. Inspection showed only generated orientation, resolution, color-space and pixel-dimension tags; its GPS IFD was empty. The acceptance fixture now carries explicit synthetic GPS, camera, date and description metadata, and the output check rejects all such original metadata and thumbnails while permitting only exact generated geometry/color tags. This retains the privacy assertion instead of treating any EXIF header as private data.

During diagnosis, the native check was replayed on a checksum-verified simulator shell with the identical locked SDK. The permanent workflow compiles the current native source anew, so it has no dependency on an expiring artifact. Its local-network exception and disposable probe entrypoint exist only in CI; no probe is distributed through TestFlight. CI runtime, regression, browser, native compilation and signed TestFlight outcomes are recorded separately below. The automated checks used synthetic data and no paid model call. No App Review, main application release or Stage 33 PASS is claimed.

## Verified release status — 28 October 2026

The reviewed candidate is `fcf741dc079faf4c790947d11b4e7452c53a47fd`, merged into the existing internal TestFlight release branch at `8ffc92c4d0c3478e3591ea11d24f4da9ec7e24fe` through [PR 51](https://github.com/umutbarut7-svg/Beauty-platform/pull/51).

- [Regression and workspace checks, run 40671879086](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40671879086): SUCCESS.
- [Application/browser review, run 40671879164](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40671879164): SUCCESS; all 36 mobile/client tests and Chromium/WebKit customer/business/photo contracts passed.
- [Native application compilation, run 40671879131](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40671879131): SUCCESS for Android and iOS.
- [Signed internal update, run 40674840946](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40674840946): SUCCESS. ORZELL 1.0.0 (1051) passed the mobile checks, physical-device archive, signed IPA export, Apple validation and upload.
- [Apple processing and internal access, run 40677616524](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40677616524): SUCCESS. At 14:08:48 Europe/Istanbul, build 1051 was `VALID`, associated with the existing `ORZELL iç test` group, and `IN_BETA_TESTING`. No testers or groups were added; the existing platform HTTPS-only encryption exemption was recorded for this unchanged dependency inventory.
- [Additional fresh native runtime, run 40671879020](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40671879020): NOT PASS. Attempt 1 failed during external React Native dependency download with an HTTP/2 error. Attempt 2 hit the job time limit while the React Native release dependency download remained at 38%; the runtime/strict GPS-removal/cleanup step was skipped. This is an unresolved verification limit, not a passing runtime acceptance.

Earlier simulator diagnostics on identical application photo code demonstrated native reading/encoding and authorized HTTP multipart transfer of a valid bounded JPEG. They do not replace the unfinished stricter fixture check. Owner-device UI evidence is recorded separately below.

Build 1051 is available as an internal test update. The owner-device observation below closes the visible photo-save and completed-plan rendering check for that attempt. Recommendation quality and the remaining Stage 33 decisions remain open; no public release, App Review or overall Stage 33 PASS is claimed.

## Owner-device observation — 28 October 2026, 14:15 Europe/Istanbul

After being instructed to update to TestFlight 1.0.0 (1051), enter the agreed hair consultation request/goal and retry photo upload, the owner replied that the steps were completed and supplied two iPhone screenshots.

The first screenshot shows the photo-saved confirmation, consultation status `Plan hazır`, hair observations, a five-item proposed consultation plan, and the `Plana göre profesyonel ara` action. The second screenshot shows the remaining plan, professional-search action and guidance. The previous upload-failure message is absent from these visible result screens.

This is a PASS for the owner's observed photo-save and completed-plan rendering in this attempt. It is screenshot/UI evidence: the screenshots do not display the build number, request identifiers, selected original image or provider trace. Build 1051 is the instructed release, not independently identifiable from the images. The observation does not by itself certify image/response matching, recommendation accuracy, metadata removal, retention/deletion, permission revocation or a fresh upstream model call. No original customer photograph or screenshot is copied into this repository.

Next owner check: use the displayed professional-search action and verify the resulting search/list screen. The additional strict native runtime check remains NOT PASS for the dependency-download timeout above. Overall Stage 33 acceptance remains open.
