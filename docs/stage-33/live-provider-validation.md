# Stage 33 — live provider evidence and adapter gate

## Verified from owner-run CloudShell output, 21 October 2026

- A Standard SecureString parameter at
  `/beauty-platform/dev/openai-api-key` was created in `eu-north-1` using
  `alias/aws/ssm`. Its plaintext was not sent to the assistant or committed.
- Reading that parameter in memory and calling `GET /v1/models` returned HTTP 200.
- A short `text-embedding-3-small` request returned HTTP 200; the owner-run script
  checked the model name, 1536 finite dimensions and a nonzero vector.
- A synthetic blank PNG sent to `gpt-5.4-mini` through Responses returned HTTP
  200 and passed the script's bounded JSON/no-visible-hair assertions. The request
  set `store: false`. This was a standalone Python probe, not the Nest adapter.
- The initial embedding attempt failed with `credit_balance_exhausted`.
  After the owner funded the API account, the retry succeeded. This does not
  establish a runtime spend cap or long-term service availability.

## New, manually triggered live adapter gate

Workflow: `.github/workflows/stage33-live-adapters.yml` on `main`.
Harness: `scripts/stage33-live-adapters.cjs`.

The workflow builds the explicitly reviewed application commit
`123e7339e2ab2a9e8e94f391a8431b73afc28efe` before obtaining AWS credentials. It
does not accept a checkout-ref input or run for pull requests. A dedicated
`BeautyPlatformLiveAdapterTest` role trusts only this repository's current
main-branch OIDC subject. The audit role is not changed. Role provisioning is an
owner-run CloudShell action using `scripts/bootstrap-stage33-live-test-role.py`.

The role reads one SSM parameter and restricts S3 object writes/deletes to
`private/mvp/f33f33f3-*` in the existing development bucket. It can inspect public
access blocks and versioning and list only that reserved synthetic prefix.
KMS decrypt permission is scoped to the existing SSM key, SSM service and
parameter encryption context. It has no IAM, bucket-configuration, provisioning
or budget write permissions.

The gate invokes the compiled `PrivatePhotoStore` and `OpenAiBeautyProvider`
classes. It checks private encrypted S3 upload/read, overwrite rejection,
EXIF removal, anonymous denial, one live embedding and one live structured
vision response. A finally block erases only its generated synthetic object and
uses a prefix-limited listing to verify absence. It emits fixed pass/fail labels;
it does not publish image bytes, object keys, vectors, response text or secrets.
There are no diagnostic artifacts or automatic retries of paid model calls.

At preparation time this gate has **not run with live credentials**. Provisioning
the dedicated role and explicitly running the workflow remain required.

## Remaining acceptance boundary

Passing these adapter checks does not prove the complete HTTP consent/upload/
analysis/withdrawal journey, PostgreSQL/pgvector live matching, worker expiry and
retry behavior, real-photo quality, reviewed legal policies, device acceptance
or deployment readiness. It does not enable product rollout flags or merge the
Stage 33 application. Stage 33 remains DRAFT / NOT PASS overall.
