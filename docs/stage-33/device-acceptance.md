# ORZELL physical-device acceptance

Application reference: `3be316d1b2458c49fde162147244aa8077a1f614`.
The final store identity and signed phone build are not yet established.
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

All physical-device rows remain NOT RUN. Existing iOS simulator and synthetic
live web evidence remain valid only within their recorded scopes. Android
emulator acceptance is tracked separately in its workflow and readiness report.
Stage 33 remains NOT PASS until the device, reviewed policy, real-photo quality
and production operation requirements are satisfied.
