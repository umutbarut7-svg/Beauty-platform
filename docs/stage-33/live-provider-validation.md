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

## Verified live adapter run

[Run 39605805326](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39605805326)
completed with **SUCCESS** on 21 October 2026. Job 119241568165 verified the
scoped OIDC role and in-memory encrypted parameter binding, and emitted all four
expected passing checks:

- Real private AES256 S3 upload/read, overwrite rejection, anonymous denial and
  EXIF removal.
- The compiled application embedding adapter returned a validated 1536-dimension
  vector from OpenAI.
- The compiled vision adapter accepted a synthetic image and validated a live
  structured response with NEEDS_INFORMATION.
- The synthetic object was physically erased; the reserved-prefix listing
  confirmed its absence.

The application revision was `123e7339e2ab2a9e8e94f391a8431b73afc28efe` and
workflow/harness revision was `e6645a9cbbad8ba2c557c6f2b51619ebba55c72d`.
No live database or customer photo was used. The pass does not certify photo
quality or the complete consent/worker/catalog/device acceptance journey.

## Remaining acceptance boundary

Passing these adapter checks does not prove the complete HTTP consent/upload/
analysis/withdrawal journey, PostgreSQL/pgvector live matching, worker expiry and
retry behavior, real-photo quality, reviewed legal policies, device acceptance
or deployment readiness. It does not enable product rollout flags or merge the
Stage 33 application. Stage 33 remains DRAFT / NOT PASS overall.
