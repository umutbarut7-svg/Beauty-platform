# Photo configuration candidate — 27 October 2026

Status: PREPARED, NOT DEPLOYED. Photo/AI/policy gates remain closed. This file does not record completed legal review.

## Verified live evidence

[Read-only run 40557187791](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40557187791) reached the preview instance through the existing PreviewOperations role and completed successfully.

Both API and worker were running without an OOM flag. Core and S3 flags were true. AI, semantic and photo-policy flags were false. Photo notice/version were absent; retention values were absent or invalid. Per-user daily quota was 5 and platform daily quota was 20. Configuration presence does not prove bucket safety, cleanup completion or provider credentials.

The API and worker report different image IDs. Determine their application revisions and cleanup compatibility before enabling real-photo ingestion; different IDs alone do not prove incompatibility.

## Prepared change

`infra/operations/photo-policy.pending.override.json` stages the same notice, draft policy version, 24-hour photo/consultation retention and 90-day evidence retention for both API and worker. It explicitly leaves AI, semantic and policy review false. No keys, database credentials, image changes, ports or resource declarations are included.

It is not a standalone Compose deployment and is not applied automatically by this PR. Do not use an old base Compose file to recreate running services: it could revert core rollout, images, origins or earlier fixes. First identify and preserve the actual runtime Compose files, non-secret environment-file path and image digests.

The user-declared operator/contact in the existing policy draft are Umut Barut / orzellapp@gmail.com. They have not been independently verified here. The notice is a review candidate, not a legal-compliance certification. Review photo processing separately from business-verification policy; unrelated registry/reviewer setup is not a technical prerequisite for the photo gate.

## Provider retention clarification

[OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data), checked 27 October 2026: `store:false` is not a Zero Data Retention guarantee. Default abuse-monitoring logs can include customer content and generally remain for up to 30 days, subject to the documented exceptions. The account's retention controls and processing arrangements were not inspected. ORZELL's 24-hour lifecycle must not be represented as the provider's retention guarantee.

The candidate notice replaces the old placeholder provider link and distinguishes application access expiry, asynchronous physical deletion and provider retention.

## Remaining actions

1. Inspect actual runtime Compose provenance and long-running worker entry point without printing secrets.
2. Confirm existing SSM OpenAI binding and private storage/IAM settings without exposing credentials.
3. Review the exact candidate notice and provider arrangements before setting a reviewed-policy value.
4. Stage the closed-gate notice/retention configuration using current image digests and a rollback plan; verify API/worker agreement and health.
5. Verify cleanup using isolated synthetic fixtures. Never label physical erasure complete on a failed storage delete.
6. Enable only approved photo/AI gates, preserving request quotas, then verify authenticated policy retrieval, explicit consent, upload, analysis and withdrawal. Real person photos require the person's separate in-app consent.

No deployment, paid model request, customer photo upload or runtime approval flag change was performed by this PR.
