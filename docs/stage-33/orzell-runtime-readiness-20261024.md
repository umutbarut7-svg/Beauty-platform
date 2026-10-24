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

Before a signed phone build, the owner needs to complete Apple account enrollment
and any required membership/payment/agreements, then provide the Apple team
identifier and final app identity through a secure setup. Do not put passwords,
two-factor codes, certificates or private API keys into chat or the repository.
The current CI bundle identifier is a temporary test namespace, not a confirmed
store identity. Simulator checks are not physical-device acceptance.

## Policy and real-photo inputs still required

The working product name is ORZELL. No registered company or legal operator
identity is invented from the brand.

The remaining factual inputs are the legal individual/company operating the
platform, its public privacy/support email, launch market and official registry
source for business checks, and the independent reviewer's assignment.
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

An encrypted production-backup destination, access controls, retention and
revocation reconciliation must be decided and validated before automatic
production backup/recovery is enabled. A worker restart or isolated pg_dump test
must not be represented as completion of that work.

Stage 33 remains NOT PASS pending the genuine device, reviewed-policy,
real-photo and production-operating acceptance boundaries.
