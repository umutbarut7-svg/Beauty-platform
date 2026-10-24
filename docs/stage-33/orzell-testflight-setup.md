# ORZELL TestFlight preparation

The ORZELL app record uses explicit Bundle ID `com.orzell.app`, Team ID `CDL78S6U9A`, SKU `ORZELL-IOS-001`, and Turkish primary language. The internal group `ORZELL iç test` contains the owner tester.

On 24 October 2026, read-only Apple API run 40115611597 verified that the active `ORZELL App Store` provisioning profile matches the bundle, team, distribution certificate, and original CSR public key. The profile's CMS signature and App Store entitlements were checked. No uploaded build existed at that check.

## Signed build workflow

`.github/workflows/orzell-testflight-upload.yml` builds the reviewed Stage 33 application on macOS. It runs only for an explicit dispatch or a workflow-file push to `codex/orzell-testflight-upload`; it never runs on a pull request. Repository permissions are limited to contents read and actions read. Apple API secrets are supplied only to signing and upload steps, after dependency installation and native generation.

The workflow uses the real release identity, version 1.0.0, a distinct numeric build number derived from the run number and attempt, the original reference brand image for the icon, and the existing HTTPS preview API. It does not run `scripts/stage33-native-config.cjs`, which intentionally changes the namespace for simulator validation.

The original RSA distribution key was backed up with the owner's explicit approval as an AES-256-GCM encrypted GitHub artifact for 90 days. Signing recovers only artifact 12567174637, checks its fixed ZIP digest, authenticates the encrypted payload using HKDF-SHA256 derived from the canonical Apple API private-key DER, and checks the recovered key against the original CSR and Apple certificate. Keep the original Apple .p8 file and encrypted backup; expiry or deletion of the backup requires a new signing identity setup, not a blind rerun of CSR generation.

A temporary keychain and provisioning profile are installed on the disposable macOS runner. Native dependency targets do not receive the app's provisioning profile. The archive is built for physical iOS devices, its identity and signature checked, and an App Store Connect IPA exported. Apple validation precedes upload. The final cleanup step removes API private-key files, recovered signing files, the temporary keychain, and the installed profile. Private signing material is never committed or published as a plaintext artifact.

The workflow uploads a binary for TestFlight processing. It does not request App Review or a public release. A successful upload alone does not prove Apple processing, tester availability, physical-device acceptance, or Stage 33 PASS.

## After upload

Confirm Apple processing completed, resolve actual export-compliance questions based on the compiled application's encryption use, and assign the processed build to the internal group. Do not guess encryption declarations. Then verify installation on the owner's iPhone and complete the device acceptance checklist.

References:

- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/documentation/appstoreconnectapi/get-v1-profiles
- https://docs.github.com/en/rest/actions/artifacts
