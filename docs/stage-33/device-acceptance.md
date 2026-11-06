# ORZELL physical-device acceptance

## Current delivery and focused acceptance — 6 November 2026

The latest recorded internal delivery is **ORZELL 1.0.0 (1151)**, application
`2e56def282c97a804a2f3d6c9b36a53b42a09df5`, signed build source
`9c487dc425d157a2a5bb1de9bc48beab63eda90c`. The
[upload run](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/41986541356)
completed; Apple VALID / IN_BETA_TESTING and existing internal-group access were
recorded on 5 November at 10:32 Istanbul. Physical installation of 1151 has not
been confirmed. The 1031 candidate and closed-gate descriptions below are
historical; they are not the current delivery or a request to repeat every row.

Prior owner confirmations of login, booking, business selection, confirmation
and cancellation remain accepted within their recorded scope. On 31 October,
active consultations, stored analysis/plan and reopening completed matching
results were observed on the owner's iPhone; association with 1111 relies on the
owner's update report because screenshots did not display a build number. These
checks do not establish source-photo fidelity, useful recommendation quality or
the newer result/satisfaction write paths.

The delivered 1151 additions are shared service cards, product/inventory and B2B
surfaces, and appointment-linked batch material consumption. Automated shared
flow coverage is recorded in
[the materials delivery](appointment-materials-publication-20261105.md).
Test the shared behavior once; do not request a separate full test for each
catalog entry. Physical Android acceptance remains open; emulator/simulator
evidence cannot close it. A new paid photo/matching/indexing call requires its
own explicit authorization; the previous one-use test must not be repeated.

Use the current [progress ledger](progress-ledger.md) for outstanding gates.
An actual new device observation is required to close a device row; updating
this document does not create one.

## Historical 1031 acceptance specification

Application candidate: `589fe6ae579cf10beac4f045c9b6e26e2e13e2c0`.
Store identity is `com.orzell.app`. Signed ORZELL 1.0.0 (1031) upload run 40178879560 passed; Apple processing and existing internal-group access were verified by run 40179728482 as VALID / IN_BETA_TESTING on 25 October 2026.
Earlier installation/login reports for build 1011 do not certify the new candidate.
An emulator/simulator run must never be recorded as physical-device acceptance.

## Installation prerequisites

- iPhone: Apple Developer membership must be active, the final app identity
  confirmed, signing configured securely, and a processed build available through
  TestFlight. Enrollment payment confirmation alone does not satisfy this gate.
- Android: use the reviewed ARM phone APK on a designated compatible test phone;
  an x86_64 emulator APK is a separate build and is not its installation evidence.
- Record device model, OS version, app version/build, application revision and
  installation channel. Confirm the API points at the intended preview and use
  explicitly labelled test records. Never record passwords, tokens or identity
  documents in screenshots, chat, repository or test evidence.

## Core journey on each physical platform

| Step                                   | Observable acceptance                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Install and cold-launch twice          | Original ORZELL emblem/wordmark and Turkish sign-in render; no Metro dependency, crash or blank screen                 |
| Switch sign-in/register                | Fields, keyboard, masked password and buttons remain usable; opening the keyboard does not hide the active control     |
| Sign in with a designated test account | Correct customer area opens; invalid credentials show a useful error without granting access                           |
| Discover test business/service         | Selected business/service and available dates are clear; invalid or past dates are rejected                            |
| Choose a slot                          | Selection alone creates no appointment; confirmation identifies the chosen service, time and business                  |
| Confirm booking once                   | Exactly one appointment appears and persists after refresh/relaunch; a rapid second tap does not duplicate it          |
| Cancel explicitly                      | Opening cancellation does not cancel; confirming cancellation persists as CANCELLED after refresh/relaunch             |
| Customer/business mode                 | Owner personal booking remains the owner's customer booking; business data belongs to the selected authorized business |
| Care history and ledger                | Views load without invented results/revenue; insufficient data remains explicit                                        |
| Sign out and relaunch                  | Authenticated screens/data cannot be reopened; another test account cannot inherit the previous account's state        |
| Offline/reconnect                      | Network failure is visible and recoverable; retry does not silently create an extra booking                            |

Record each row independently on iPhone and Android as NOT RUN, PASS, FAIL or
BLOCKED, with evidence and any remaining limitation. Do not copy web acceptance
results into the physical-device column.

## Photo/AI acceptance is a separate gated journey

The current closed photo/AI policy flags must remain closed until operator,
policy/provider conditions and test-photo authorization are reviewed. A current
unavailable-capability message is not a completed photo test.

When that gate is satisfied, observe on each platform: explicit consent before
upload, photo-library permission denial/recovery, cancelling the picker without
upload, selecting only the owner's explicitly authorized test photo, follow-up
questions, PLAN and recommendation quality, withdrawal during an in-flight
request, denied access after withdrawal and actual storage erasure. Photograph
selection and successful transport alone do not establish useful AI output.

Do not use an unrelated Library image or a salon customer's photograph as a test
fixture. Do not turn a pending or failed physical erasure into PASS.

## Current status

Prior user-confirmed functional checks are preserved in [progress-ledger.md](progress-ledger.md). Do not label every historical check NOT RUN or request a complete repeat by default. Exact-build physical acceptance for 1031 remains separate where evidence is missing; unknown build/platform metadata does not erase earlier confirmations.

The new keyboard layout and branch/professional filtering already passed automated regression and Android emulator acceptance. Ask for a focused manual check only after documenting the concrete change or failure, the affected previous evidence and why automation is insufficient. Existing simulator and synthetic web evidence remain valid within their recorded scopes.
Stage 33 remains NOT PASS until the device, reviewed policy, real-photo quality
and production operation requirements are satisfied.
