# ORZELL native preview

The older `stage33-native-builds.yml` workflow described below builds the
`123e7339` application revision using legacy preview overlays and the
`dev.epifiz.preview` namespace. Those older packages must not be confused with
the current ORZELL application artifacts from run `40073686234`, whose test
namespace is `com.beautyplatform.stage33test`. See
[the current release record](orzell-preview-release-20261024.md),
[readiness](orzell-runtime-readiness-20261024.md) and
[physical-device acceptance](device-acceptance.md).

These are test artifacts for the existing preview API, not store releases. The source revision and build-harness revision are included with each artifact. No AWS, OpenAI or owner credential is included.

- Android: arm64 APK, bundled JavaScript, separate `dev.epifiz.preview` application ID. The generated Expo template uses test/debug signing; this is not a production upload key. Install only on a designated Android test device. Store submission is not part of this workflow.
- iOS: unsigned simulator `.app` archive for a Mac with a compatible iOS Simulator. It cannot be installed on a physical iPhone and is not an IPA or TestFlight build. Real iPhone installation needs a later signing/distribution setup.
- Both use `https://preview.13-51-112-228.sslip.io/api`. The preview database is real; use explicitly labelled test records. Photo/AI policy gates remain in their current server state.

Build success does not establish device launch, registration, booking, photo picker behavior, consent/withdrawal or real-photo quality. Those must be observed separately. The current product brand is ORZELL; the original emblem and wordmark must be preserved.

Build method references: [Expo local builds](https://docs.expo.dev/guides/local-app-overview/), [native project generation](https://docs.expo.dev/workflow/prebuild/). Only generated native projects in disposable CI checkouts are built; existing servers and user data are not changed.
