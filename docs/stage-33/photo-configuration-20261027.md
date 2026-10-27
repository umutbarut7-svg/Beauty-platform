# Photo configuration candidate — 27 October 2026

Status: PREPARED, NOT DEPLOYED. Photo/AI/policy gates remain closed. This file does not record completed legal review.

## Verified live evidence

[Read-only run 40557187791](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40557187791) reached the preview instance through the existing PreviewOperations role and completed successfully.

Both API and worker were running without an OOM flag. Core and S3 flags were true. AI, semantic and photo-policy flags were false. Photo notice/version were absent; retention values were absent or invalid. Per-user daily quota was 5 and platform daily quota was 20. Configuration presence does not prove bucket safety, cleanup completion or provider credentials.

The API and worker report different image IDs. Determine their application revisions and cleanup compatibility before enabling real-photo ingestion; different IDs alone do not prove incompatibility.

## Runtime provenance verified — 27 October 2026

[Run 40558284363](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40558284363) completed successfully through the existing PreviewOperations role. No runtime settings were changed.

Both services use working directory `/opt/epifiz/application-123e7339/infra/preview` and base `compose.yml` there. The API additionally uses `/opt/epifiz/operations/booking-context-20261022/mvp.yml` and its `live.env`. The worker additionally uses `/opt/epifiz/operations/mvp-test-20261022/mvp-test.yml` and its `live.env`. These environment-file paths were observed; their contents were not emitted.

A long-running `dist/worker.js` process was observed. This proves process presence, not successful expiry sweeps or physical deletion.

## Prepared change

`infra/operations/photo-policy.pending.override.json` stages the same notice, draft policy version, 24-hour photo/consultation retention and 90-day evidence retention for both API and worker. It explicitly leaves AI, semantic and policy review false. No keys, database credentials, image changes, ports or resource declarations are included.

It is not a standalone Compose deployment and is not applied automatically by this PR. Do not use an old base Compose file to recreate running services: it could revert core rollout, images, origins or earlier fixes. First identify and preserve the actual runtime Compose files, non-secret environment-file path and image digests.

The user-declared operator/contact in the existing policy draft are Umut Barut / orzellapp@gmail.com. They have not been independently verified here. The notice is a review candidate, not a legal-compliance certification. Review photo processing separately from business-verification policy; unrelated registry/reviewer setup is not a technical prerequisite for the photo gate.

## Provider retention clarification

[OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data), checked 27 October 2026: `store:false` is not a Zero Data Retention guarantee. Default abuse-monitoring logs can include customer content and generally remain for up to 30 days, subject to the documented exceptions. The account's retention controls and processing arrangements were not inspected. ORZELL's 24-hour lifecycle must not be represented as the provider's retention guarantee.

The candidate notice replaces the old placeholder provider link and distinguishes application access expiry, asynchronous physical deletion and provider retention.

## Remaining actions

1. Runtime Compose provenance and long-running worker entry point were inspected successfully; preserve the distinct service configurations recorded above.
2. Confirm existing SSM OpenAI binding and private storage/IAM settings without exposing credentials.
3. Review the exact candidate notice and provider arrangements before setting a reviewed-policy value.
4. Stage the closed-gate notice/retention configuration using current image digests and a rollback plan; verify API/worker agreement and health.
5. Verify cleanup using isolated synthetic fixtures. Never label physical erasure complete on a failed storage delete.
6. Enable only approved photo/AI gates, preserving request quotas, then verify authenticated policy retrieval, explicit consent, upload, analysis and withdrawal. Real person photos require the person's separate in-app consent.

No deployment, paid model request, customer photo upload or runtime approval flag change was performed by this PR.

## Closed-gate staging command

`infra/operations/stage_photo_configuration.py` validates the candidate without Docker/network access by default. Its separate `--approved-staging` mode:
- derives each service's own current Compose source and environment-file paths;
- rejects changed images, changed gates, existing policy values, credential-bearing container environment, baseline drift, unexpected mounts/ports and paths outside the application root;
- pins each current image ID and recreates only worker, then API with `--no-deps --pull never --no-build`;
- checks exact resulting non-secret environment, API health, worker process presence, public API readiness and unchanged identities of database/secret helper/gateway/admin;
- attempts rollback through the original service sources if application or readiness fails. A failed rollback is explicitly reported, not counted as success.

`infra/operations/stage-photo-configuration-command.sh` is the complete proposed server command. It downloads the candidate and staging program from pinned revision `355a34a5e5bf201fca3c6c89d1ccef58d7f1d0c7`, verifies their SHA256 hashes before execution and stages only closed-gate settings. It must be reviewed/authorized before replacing the main operations command; copying this file into the draft branch does not execute it.

Validation: seven local tests passed for a no-Docker/no-network plan, rejected activation/retention mismatch/credential fields, credential export refusal, path traversal refusal, per-service source/image preservation, API-health rollback, and concurrent API replacement protection. The actual candidate also passed plan validation. These are local/mocked checks; live staging and live rollback are not claimed.

Reproduce: `python3 -m unittest discover -s infra/operations -p test_stage_photo_configuration.py -v`.

The prepared command does **not** set policy review or AI true, fetch the OpenAI key, send a photo, migrate the database, build an image or create AWS resources. The remaining provider/storage/cleanup and notice-approval gates still apply before photo activation.
