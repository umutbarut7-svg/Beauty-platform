# ORZELL device and runtime readiness — 24 October 2026

## Completed live worker recovery

Run [40074712699](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40074712699),
job 120815498465, completed successfully.

The fixed preview worker image was checked before testing. AI, photo policy,
semantic and business verification flags remained closed. The test located
exactly one `node dist/worker.js` child through non-secret process command names
and sent SIGKILL only to that child. Docker restarted the unchanged worker image
automatically; its restart count increased and a new worker child was observed.
The recovered worker survived the observation window without an OOM.

API, gateway, database, secret helper and operator start times/images remained
unchanged. Both public API readiness and CORS checks passed. No migration,
database restart, record deletion, backup, infrastructure provisioning or policy
change occurred. The default operations script was then restored to read-only.

This is actual preview process-restart evidence. It does not prove host-reboot
recovery, high availability, real-photo erasure, an encrypted production backup,
or recovery from a backup predating a consent withdrawal.

## iPhone installation dependency

The current downloadable iOS artifact is an unsigned iPhone Simulator application.
It cannot be installed on a physical iPhone.

Apple's supported choices are:

- A free developer account with Xcode for direct testing on the owner's devices.
- Apple Developer Program membership and App Store Connect for TestFlight beta
  distribution and store distribution.

Sources checked on 24 October 2026:

- https://developer.apple.com/programs/
- https://developer.apple.com/testflight/
- https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases

The owner completed the Apple Developer subscription purchase on 24 October 2026. The subsequent Developer app screenshot still shows `Enrollment Pending`;
the subscription receipt alone is not membership activation. No signed physical
phone build or App Store Connect access has been verified. Continue after the
membership becomes active; never purchase the subscription a second time merely
because enrollment is pending.

Before a signed phone build, the owner needs to complete Apple account enrollment
and any required membership/payment/agreements, then provide the Apple team
identifier and final app identity through a secure setup. Do not put passwords,
two-factor codes, certificates or private API keys into chat or the repository.
The current CI bundle identifier is a temporary test namespace, not a confirmed
store identity. Simulator checks are not physical-device acceptance.

## Policy and real-photo inputs still required

Owner-confirmed details on 24 October 2026:

| Field                                         | Confirmed value                                        |
| --------------------------------------------- | ------------------------------------------------------ |
| Product/business display name                 | ORZELL App                                             |
| Individual legal operator (owner declaration) | Umut Barut                                             |
| Public support/contact email                  | orzellapp@gmail.com                                    |
| Visual brand/wordmark                         | ORZELL; existing original emblem and styling preserved |

The owner selected Umut Barut as the individual operating ORZELL App. This records
the owner's declaration; it does not verify identity or establish a registered
company title. The original ORZELL visual brand remains unchanged.

The remaining factual inputs are launch market, official registry source for
business checks, and the independent reviewer's assignment. The supplied email has not been independently tested for delivery.
Previously selected 24-hour consultation/photo and 90-day evidence retention
remain unchanged.

Once the actual operator/contact text and provider conditions are reviewed,
the photo/AI capability can be evaluated under an explicit user consent with
the owner's chosen test photo. No unrelated Library image or salon customer
photo is assumed to be authorized for AI processing. Real-photo PLAN quality,
follow-up-question quality and recommendation quality remain untested.

## Production privacy recovery boundary

The existing isolated restore gate proves restoration of a snapshot taken after
withdrawal. A snapshot predating a later withdrawal cannot carry that revocation.
Do not reopen photo access from such a restore without a reviewed durable
revocation replay or conservative quarantine/invalidation procedure.

The conservative fallback is now prepared in
[offline-photo-restore.md](offline-photo-restore.md) and
`infra/operations/quarantine-restored-photos.sql`. It invalidates all restored
photo consents, scrubs old plans and records a distinct recovery event. The
isolated PostgreSQL acceptance [run 40077479755](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40077479755)
passed both before- and after-withdrawal snapshot scenarios on the current
packaged application. The former verified denied execution without the correct
offline/database acknowledgements, both owners, idempotency, preserved audit
expiration and actual worker erasure of local synthetic objects. This is no
claim of live recovery, encrypted production backup or real S3 erasure; the
storage isolation and reopening gates in the runbook remain necessary.

An encrypted production-backup destination, access controls, retention and
revocation reconciliation must be decided and validated before automatic
production backup/recovery is enabled. A worker restart or isolated pg_dump test
must not be represented as completion of that work.

Stage 33 remains NOT PASS pending the genuine device, reviewed-policy,
real-photo and production-operating acceptance boundaries.

## Current iOS simulator launch acceptance

PR #30 updated the launch gate to the current application artifact 12551818470,
application revision `3be316d1b2458c49fde162147244aa8077a1f614`.

[Run 40074997894](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40074997894)
passed on iPhone 16e / iOS 26.2. Native identity, self-contained JavaScript and the
byte-identical original logo were checked before installation. Both cold launches
stayed alive and produced screenshots. Evidence artifact 12552942487 was
downloaded and its SHA256 verified:
`52d362345dc2d4dcce001c3738e4dd316436dea6cf509f347bf6097f7df86b7b`.
Both screenshots were separately reviewed and show the ORZELL original logo,
wordmark and Turkish sign-in interface, without an error screen.
The immutable runner evidence file correctly records that it did not itself
perform this subsequent manual screenshot review.

The previous attempt timed out at 60 seconds after successful installation.
The updated harness establishes the display before launch, uses a bounded
180-second launch deadline, and captures failure screenshots; a timeout never
counts as acceptance. The final launch checks and the full regression
[run 40074997881](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40074997881)
passed.

This closes the current artifact's simulator installation/cold-launch check.
Physical iPhone installation, authenticated native journeys, permissions and
real-photo behavior remain untested.

## Android emulator installation and launch acceptance

[Run 40079865297](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40079865297),
job 120830980767, passed on a fresh Android API 35 x86_64 emulator. The application
checkout is fixed at `3be316d1b2458c49fde162147244aa8077a1f614`; the harness branch
head was `b3b81d4d8b8d16792fc96ab2eec37d3ec60aa131`, and the runner checked out PR
merge revision `d9ea41908214d9302d4ea987a8378346fe4ce027`.

This is a new x86_64 release build for an emulator, not the earlier ARM phone APK.
Before installing, the harness verified test namespace
`com.beautyplatform.stage33test`, display name ORZELL, bundled JavaScript,
x86_64-only native libraries and the byte-identical original logo. APK SHA256:
`59ca1377807edf9df23ab9bc1bec0766d9398f3d1a233d9839ebeef4c082e1a1`.
Both cold launches retained their process identity for five seconds, remained
foreground and exposed the Turkish sign-in controls through the native UI tree.

Evidence artifact 12554926604 was downloaded and its archive SHA256 verified:
`1340e2ea85a39c1acf371599ebf7ae149ce8c0cfd02f480303fe94c02882ab81`.
Both screenshots were separately reviewed: they show the original ORZELL emblem
and wordmark, Turkish sign-in form and no runtime error screen. The form extends
below the initial viewport; keyboard, scrolling and authenticated interactions
remain separate device acceptance items. The immutable runner evidence correctly
records that it did not itself perform this subsequent manual screenshot review.

The first attempt built the APK but failed its runner KVM access check before
starting an emulator. The corrected harness waits for udev and explicitly sets
KVM device access only on the disposable runner. This check now runs before
compilation. The successful retry and full regression
[run 40079865254](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40079865254)
passed; the failed attempt is not counted as installation acceptance.

No account, real photo, provider call or appointment was used. No existing API,
worker, database, policy flag or cloud resource changed. Physical Android and
iPhone acceptance, authenticated native journeys and photo permissions remain
NOT RUN; use [device-acceptance.md](device-acceptance.md) for those observations.
Stage 33 remains NOT PASS.
