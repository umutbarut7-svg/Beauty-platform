# ORZELL TestFlight preparation

Owner screenshots on 24 October 2026 confirm the App Store Connect app record ORZELL, explicit Bundle ID `com.orzell.app`, Team ID `CDL78S6U9A`, SKU `ORZELL-IOS-001`, Turkish primary language, and the internal group ORZELL iç test with one owner tester. The latest screenshot shows zero builds. These are owner-observed setup facts, not an API authentication or signed-build check.

The release app.json now uses version 1.0.0 and initial build number 1. Increment the build number for each subsequent upload. Do not run scripts/stage33-native-config.cjs for a TestFlight build: it intentionally changes the identity to com.beautyplatform.stage33test for isolated simulator/Android validation. That validation workflow remains unchanged.

Before uploading, configure Apple distribution signing through a secure credential store. A team App Store Connect API key can support provisioning and uploads; an individual key cannot use provisioning endpoints. Never commit a private .p8 key, signing certificate private key, password or provisioning credential. Keep CI secrets out of pull-request jobs and logs. Inspect existing credentials before generating replacements.

Build from the reviewed Stage 33 source with EXPO_PUBLIC_API_URL set to the existing HTTPS preview API. Generate a fresh iOS project from the release app.json, install pods, archive for generic/platform=iOS (not iOS Simulator), sign for the confirmed team and export for App Store Connect. Verify the exported app identity, version, build number, bundled JavaScript, original logo and distribution signature before upload. Apple signing, provisioning, archive export, upload and processing have NOT RUN. The existing simulator artifact cannot be used as a TestFlight IPA.

After Apple processing, resolve any actual export-compliance questions based on the compiled application's encryption use; do not guess declarations. Assign the processed build to the internal test group, then verify physical iPhone installation and the device acceptance checklist. A successful upload is not physical-device acceptance or Stage 33 PASS.

References:

- https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api
- https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases
