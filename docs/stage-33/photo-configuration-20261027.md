# Photo runtime configuration and enablement — 27 October 2026

Status: **photo/AI enabled in the existing early-access preview**, with authenticated capability acceptance. This is not Stage 33 PASS, a production release or real-photo quality acceptance.

## Result

[Activation run 40563100561](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40563100561) completed successfully. Both API and worker kept their existing image IDs. Public HTTPS health and an authenticated synthetic customer request verified:
- `available=true` from `/mvp/v1/photos/policy`;
- policy version `orzell-photo-2026-10-27-v1`;
- the exact prepared notice and 24-hour content retention;
- a successful logout of the synthetic refresh session.

The owner previously explicitly requested opening the photo approval/feature and continuing the missing setup. Operational policy and AI flags were enabled under that instruction. This records owner-requested early-preview enablement and the reviewed technical notice content, not independent verification of operator identity, legal-compliance certification or professional legal signoff.

Runtime values after activation:
- `STAGE33_MVP_ENABLED=true`;
- `MVP_AI_ENABLED=true`;
- `MVP_PHOTO_POLICY_REVIEWED=true`;
- `MVP_PHOTO_RETENTION_HOURS=24`;
- `MVP_PHOTO_AUDIT_RETENTION_DAYS=90`;
- existing quotas retained: 5 requests per user/day and 20 globally/day.

Semantic matching and business-verification gates were not enabled. The database, secret helper, gateway and admin container identities were unchanged. No new AWS resources, schema migrations or paid model calls were made by these operations.

## Verified runtime evidence

| Run | Evidence |
| --- | --- |
| [40557187791](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40557187791) | Both target processes running; core/S3 enabled; missing notice/version/retention; closed photo/AI gates; existing quotas. |
| [40558284363](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40558284363) | Exact per-service Compose provenance and a long-running worker process. Process presence does not prove successful expiry sweeps. |
| [40560495268](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40560495268) | Notice and 24h/90d settings staged with gates still closed, same images, exact environment agreement and healthy services. |
| [40561044269](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40561044269) | Both containers passed private-bucket security checks, read the existing encrypted OpenAI parameter in memory, authenticated to the non-billable models endpoint, and found the configured vision model. No key was exported or logged. |
| [40562432658](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40562432658) | A reserved, newly generated synthetic object was normalized without EXIF, privately uploaded/read with AES256 encryption, denied anonymous access, and received a successful S3 DeleteObject acknowledgement. |
| [40563100561](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40563100561) | Owner-requested photo/AI enablement plus authenticated public capability, exact version/notice/retention and refresh logout acceptance. |

The runtime role intentionally lacks bucket-list permission. The synthetic storage check therefore does **not** claim an independent post-delete absence listing. No extra IAM permissions were granted just for this check. Successful S3 deletion acknowledgement, earlier CI adapter absence evidence, continuous cleanup acceptance and backup/restore erasure guarantees are distinct pieces of evidence.

## Actual runtime provenance

Both target services originally used working directory `/opt/epifiz/application-123e7339/infra/preview` and its `compose.yml`.

- API additionally used `/opt/epifiz/operations/booking-context-20261022/mvp.yml` with that folder's `live.env`.
- Worker additionally used `/opt/epifiz/operations/mvp-test-20261022/mvp-test.yml` with that folder's `live.env`.

Staging and activation append separate service-specific override files in private operation folders. Each service retains its original sources and its own image ID. Environment-file contents and process credentials were not printed. Always inspect current Compose labels before later maintenance; do not recreate these services from an old shared manifest.

## Prepared and applied code

- `photo-policy.pending.override.json` remains a **closed-gate draft input**. It contains no key, credential, port, image or resource setting. Its state is not a live-status indicator.
- `stage_photo_configuration.py` defaults to a local plan. Explicit staging derives current per-service Compose sources, rejects drift/credential-bearing configuration and pins each current image. Only worker and API are recreated with `--no-deps --pull never --no-build`.
- `activate_photo_configuration.py` additionally requires the exact staged notice fingerprint, the recorded draft version and the existing 5/20 quotas. The explicit activation path enables only photo-policy and AI gates and changes the policy to v1.
- The replacement helper verifies image/environment agreement, API health, worker process presence, public API readiness and unchanged unrelated containers. If an acceptance callback fails, rollback is attempted through each original service source; failed rollback is explicitly reported.
- `stage-photo-configuration-command.sh` pins staging revision `3adce2cbd8fe82c9a251da3e88264b89e88c77d9`. `activate-photo-configuration-command.sh` pins activation bundle `1a508a024e23a3c1e93c54b3d81fda5a655bbb0c`. Both verify SHA256 input hashes before execution.
- Read-only provenance/provider probes and the scoped synthetic storage probe are included separately.

The first staging attempts stopped before service replacement because the preflight comparison did not handle Compose's `entrypoint: null` inheritance correctly. That comparison was corrected against [Docker's documented semantics](https://docs.docker.com/reference/compose-file/services/) and covered by a regression test; a real changed entrypoint still blocks replacement.

## Provider retention notice

The notice distinguishes ORZELL's content-access/erasure lifecycle from [OpenAI's API data controls](https://developers.openai.com/api/docs/guides/your-data). `store:false` is not a Zero Data Retention guarantee. Default abuse-monitoring logs can contain customer content and generally remain for up to 30 days, subject to documented exceptions. This work does not certify the account's provider-specific retention controls.

Operator/contact values follow the existing owner declaration: Umut Barut / orzellapp@gmail.com. Photo and consultation access expires after 24 hours; physical deletion is asynchronous and must not be reported complete when storage erasure fails. Consent/operation evidence uses the recorded 90-day lifetime.

## Validation and remaining acceptance boundary

Ten local tests passed for closed-gate input validation, exact activation notice/narrow gates, Compose null inheritance versus real entrypoint drift, credential/path safeguards, per-service source/image preservation, failed-health rollback, failed-authenticated-capability rollback and concurrent replacement protection. Both actual configuration candidates passed plan validation without Docker/network requests. Rollback tests are mocked; live rollback was not forced.

Reproduce: `python3 -m unittest discover -s infra/operations -p test_stage_photo_configuration.py -v`.

Still unproven by this enablement:
- real-person photo analysis quality, PLAN-to-matches relevance and follow-up-answer quality;
- the complete live browser/native consent/upload/analyze/withdraw journey;
- continuous wall-clock expiry and independently observed physical cleanup, backup/recovery erasure and sustained load;
- final platform/policy acceptance and real-device acceptance for Stage 33.

Only synthetic data was used here. The activation smoke created a private synthetic customer record and revoked its refresh session; it did not upload a person photo or call the paid vision endpoint. Real people must separately read and accept the in-app photo consent before uploading.
