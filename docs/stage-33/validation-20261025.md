# ORZELL acceptance checkpoint - 25 October 2026

Full Stage 33 status: **NOT PASS**. This checkpoint separates technical evidence from physical-device, policy and production acceptance.

## Verified code and tests

Application candidate: `589fe6ae579cf10beac4f045c9b6e26e2e13e2c0`.
The booking branch/professional fix was merged in PR #41. PR #43 adds a keyboard-aware screen container and Android status-bar spacing.

| Gate                                               | Evidence                             | Result                                                       |
| -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| Mobile/client checks                               | Local typecheck, lint and 18 tests   | PASS                                                         |
| Full regression                                    | Run 40178154400                      | PASS                                                         |
| Isolated web UI journey                            | Run 40178154516                      | PASS                                                         |
| Android and iOS compilation                        | Run 40178154459                      | PASS                                                         |
| Android API 35 native forms                        | Run 40178178431 / job 121123326301   | PASS                                                         |
| Current API privacy-worker recovery                | Run 40177962465, API source 06242d0  | PASS                                                         |
| Current API before/after-withdrawal restore matrix | Run 40177962492, API source 06242d0  | PASS                                                         |
| Recovery harness regression                        | Run 40177962460                      | PASS                                                         |
| Live service health and CORS                       | Run 40178245687                      | PASS                                                         |
| Read-only backup scheduling inspection             | Run 40178762105                      | Completed; not backup acceptance                             |
| Live S3 and OpenAI adapters                        | Run 40179062434 / job 121125980340   | PASS                                                         |
| Signed iOS upload                                  | Run 40178879560, ORZELL 1.0.0 (1031) | PASS: processed VALID and available to existing internal group (run 40179728482) |

The keyboard-aware candidate changes UI only relative to the API source used by the recovery tests.

Native form evidence covers two cold launches, registration/login tabs, actual synthetic email and masked-password entry, software keyboard state, scrolling, submit reachability, empty-email and short-password rejection, keyboard dismissal and cleared errors after switching tabs. It does not cover authenticated native booking or a physical phone.

Archive 12593405239 SHA256:
`7f7734c5dfea3cd140934b07d99379df56510adacdc0c4ff66c4fa01406eec38`.
The password-keyboard and validation screenshots were reviewed separately. Earlier failed runs remain failures; no assertions were removed to obtain acceptance.

Live adapter acceptance used one synthetic gray image and the existing encrypted API key previously selected by the owner. Private encrypted S3 upload/read, EXIF removal, 1536-dimensional embeddings, structured vision output and physical erasure/absence passed. No real user photo, production database or rollout flag changed. This is transport/adapter evidence, not useful real-photo recommendation quality.

## Remaining release blockers

- Physical iPhone and Android acceptance on the exact candidate, including authenticated booking, cancellation, relaunch, logout and offline/reconnect.
- Explicitly authorized real-photo quality evaluation and reviewed photo/provider disclosure.
- Final launch market, official registry procedure and independent business reviewer assignment.
- Account deletion: the current mobile account UI and authentication controller do not expose a complete self-service deletion path. Tenant privacy requests are operator-scoped and are not a substitute for global user-account deletion.
- Public reviewed privacy/support URLs, factual App Privacy answers, review-account access and final device screenshots.
- Encrypted, automatic production backups and tested production recovery. The read-only inspection found no backup-related systemd timer/unit or conventional application-backup directory. Root cron was unverified. These observations do not prove the absence of every possible backup mechanism.
- Durable withdrawal handling during a production recovery, storage isolation and actual continuous live cleanup acceptance.

Isolated restore tests and a named PostgreSQL volume do not establish production backups or disaster recovery. Keep the live photo/AI and verification policy flags closed pending their actual review.

## Review artifacts

A three-page UI review PDF contains six actual web-screen captures from run 40176888493, using synthetic fixture data: sign-in, discovery, booking confirmation, customer bookings, business home and business summary. It records its original source revision 06242d0 and is not represented as store screenshots or a final design.

No App Review, external beta distribution or public release was requested.

Apple rejected a redundant explicit internal-group association attempt in run 40179174250 (HTTP 422). The corrected confirmation run 40179728482 verified the existing group's automatic access without retrying unsupported association writes. The failed attempt is not counted as acceptance.
