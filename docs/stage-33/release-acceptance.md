# ORZELL release acceptance

This register separates tested code, native compilation, physical-device evidence and public rollout. Stage 33 is **NOT PASS**. Stage 34–35 remain blocked by its open acceptance items; their original detailed scope must be recovered before claiming their completion.

## Reproducible technical evidence

| Gate                                         | Evidence                                                                                                     | Boundary                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Original logo and display-name preparation   | PR #22, harness `49b469b37e0bc17a315bfa1ec5830154dca330b7`; canonical checksum in `config/brand/orzell.json` | Original image bytes, O/Z + RZELL arrangement; native launcher icon is unchanged                                                    |
| Offline mobile/browser/photo journey         | [Run 40016474608](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40016474608)                | Synthetic API responses and PNG; no real model, storage or customer image                                                           |
| Prisma/API/workspace regression              | [Run 40016474422](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40016474422)                | Disposable CI database; inspect final run conclusion                                                                                |
| ORZELL Android and iOS simulator compilation | [Run 40016474475](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40016474475)                | Inspect each platform's final conclusion and artifact; compilation does not establish launch or physical-device acceptance          |
| Live provider/storage/HTTP/worker fixtures   | [Existing evidence](live-provider-validation.md)                                                             | Earlier pinned application, synthetic fixtures and disposable database; no real-photo quality or sustained privacy operations claim |

Both native builds use application `123e7339e2ab2a9e8e94f391a8431b73afc28efe` plus the stated build harness. Record both revisions for every device test. CI artifacts expire after seven days; expired download links are not evidence of a fresh build.

## Physical-device acceptance

Use designated test accounts and clearly labelled test appointments. Capture platform/OS, device model, artifact filename and checksum, application revision, harness revision, test date and observed result. Do not attach passwords, tokens, customer records, identifiable photos or policy evidence to public CI artifacts or this repository.

| Scenario                         | Expected result                                                                                                                                           | Current evidence                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Install and cold launch          | Correct ORZELL display name and original header; readable layout; no immediate crash                                                                      | Pending physical Android and iPhone                                               |
| Registration and login           | Invalid input is actionable; valid test account signs in; duplicate registration and incorrect password do not claim success                              | Browser checks only; native pending                                               |
| Customer booking                 | Select the intended test business, service, professional, date and available slot; confirmed appointment appears with the same details after refresh      | Earlier owner web checks; native pending                                          |
| Customer cancellation            | Explicit confirmation is required; cancel a future eligible test appointment; refreshed list/detail retain CANCELLED                                      | Automated behavior checks; native pending                                         |
| Business selection               | Intended business remains visible; its appointment list and revenue summary load in the same context                                                      | Earlier owner web checks; native pending                                          |
| Closed photo policy              | Upload/analysis stays unavailable; ordinary catalog/booking remains usable                                                                                | Synthetic browser checks; native pending                                          |
| Native photo picker cancellation | When a reviewed test configuration is available, cancel the picker; no photo/analysis is created and no stale consent is left active                      | Pending approved photo test and native device                                     |
| Native photo and follow-up       | After explicit reviewed consent, one designated test image uploads; follow-up answers produce an appropriate plan and matches, or a clear bounded failure | Synthetic browser checks; real-photo/native pending                               |
| Withdrawal                       | Access closes promptly; plan/matches disappear; a late response cannot restore results; actual object deletion is verified separately                     | Synthetic race test and earlier live fixtures; native/sustained operation pending |
| Relaunch and poor connectivity   | App remains usable after background/foreground and cold launch; network failure does not claim successful login, booking, upload or deletion              | Pending physical devices                                                          |

The iOS artifact is an unsigned simulator application, not an iPhone installable IPA. Physical iPhone acceptance still needs signing/distribution setup. Google Play account registration remains deferred at the owner's request; do not treat that as completion of Android acceptance or store publication.

## Public photo/AI and operations acceptance

| Required item                     | Evidence needed before closure                                                                                                        | Status                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Operator and contact              | Actual responsible operator and working support/privacy contact; reviewed notices and verification source/reviewer                    | Unset; do not substitute Restart Hair Design automatically |
| Photo notice and withdrawal       | Reviewed version and notice; explicit consent; 24-hour content and 90-day evidence retention configuration; withdrawal path           | Public policy/provider gates remain closed                 |
| Independent business verification | Reviewed evidence fields/source, independent reviewer and 90-day evidence handling                                                    | Open                                                       |
| Real-photo quality                | Consented test samples; assessment of observations, questions, plan and actual service suitability; recorded failures                 | Open; synthetic PLAN is insufficient                       |
| Continuous cleanup                | Running worker plus repeated observed sweeps, expiry, erasure retries and physical object absence; unexpired audit evidence preserved | Earlier one-shot/retry fixtures only                       |
| Recovery                          | Isolated restore/restart exercise and proof that expired/revoked material is not re-exposed; actual restore/erasure policy            | Open; service health/restart policy alone is insufficient  |
| Release decision                  | All mandatory evidence linked, unresolved failures closed, final code checks green, appropriate signing/distribution prepared         | Blocked by rows above                                      |

The current PR does not deploy, change public flags, pay fees, migrate technical app identifiers or authorize a store release. Brand approval alone does not approve the surrounding layout or privacy notices.
