# Preview core acceptance — 22 October 2026

Status: core browser scenarios observed; Stage 33 overall NOT PASS. This records an iPhone Safari web test, not a native iOS app test.

| Scenario                   | Observed result                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer booking and lists | Booking created and visible on customer and business sides.                                                                                                                              |
| Business lifecycle         | Test booking reached COMPLETED; intermediate transitions were not individually verified because several buttons were pressed.                                                            |
| Result and feedback        | Explicit test/no-real-service summary saved; customer submitted UNSURE.                                                                                                                  |
| Beauty Passport and reload | Summary and feedback reloaded after browser refresh and sign-in; booking also reappeared.                                                                                                |
| Customer cancellation      | Explicit confirmation displayed; customer cancellation persisted and appeared as CANCELLED on business side.                                                                             |
| Released availability      | Same time was booked again after cancellation; the second test booking was also cancelled. Two cancelled history entries are separate reservations.                                      |
| Revenue without payment    | Same business showed the completed and two cancelled test bookings alongside INSUFFICIENT_DATA (no ledger records / no collected-revenue claim). This verifies the no-payment path only. |
| Business selection         | Multiple same-name business entries were visible. Empty list cleared after selecting the correct entry; identity disambiguation remains a UX issue.                                      |

Independent synthetic customer API test: [39830217320](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39830217320), success. Covers customer booking/cancel, owner lists, cross-customer read/cancel denial, unauthorized customer status changes, duplicate-slot denial and released availability.

Cancellation UI build: [39831672558](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39831672558), success. Ten behavior checks, full mobile typecheck and Expo web production export passed.

Full regression gate on PR 21: [39832266767](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39832266767), success, including Prisma/migrations, API/workspace tests/builds, formatting/typecheck/lint.

Cancellation publication: [39832861875](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39832861875), success. Public UI bundle and API health/CORS passed; unrelated services were unchanged.

Next prepared check: inspect-preview-runtime.sh is strictly a read-only runtime snapshot. It checks running services/OOM state, configured restart policies, named database volume, pinned live images, rollout flag boundaries and public health/CORS. It cannot establish host reboot recovery, backup restoration, sustained capacity or continuous privacy cleanup correctness.

Still open: reviewed identity/contact/photo/verification policy configuration; real-photo PLAN/follow-up/match quality; live AI/photo UX; physical native Android/iOS acceptance; continuous privacy operations and recovery. No real payment integration or production-ready claim is made.

## Runtime snapshot

Read-only run [39835540045](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39835540045) passed. API, worker, PostgreSQL, admin and gateway were running without current OOM state and had unless-stopped restart policies; API/database healthchecks and both public API/CORS checks passed. The database named volume and tested API/gateway images were confirmed. Core remained enabled; AI, semantic and policy-review flags remained closed. Worker restart count was 1, all other checked restart counts were 0; the cause of that historical worker restart was not established. No services were restarted by this inspection. This snapshot does not prove continuous cleanup, reboot recovery or backup restoration.
