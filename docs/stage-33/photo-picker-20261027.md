# Phone browser photo upload fix — 27 October 2026

The owner's iPhone screenshot showed the client rejection “En fazla 5 MB
boyutunda JPEG veya PNG seçin.” The deployed component issued this before
creating consent or uploading. It used the original file MIME/size and performed
no browser conversion; the screenshot alone cannot distinguish size from format.
Expo documents `quality` for Android/iOS only:
https://docs.expo.dev/versions/latest/sdk/imagepicker/ .

## Behavior and source

PR #49, `codex/photo-picker-web-20261027`, targets the Stage 33 development branch.
Exact source: `bef1f8c88547528546955485273bda45a69aad73`.

The web path reads the selected File, validates JPEG/PNG/HEIF byte signatures,
decodes locally and preserves aspect ratio with a maximum 1600-pixel edge.
Canvas re-encoding produces JPEG without copying original metadata; only that
normalized Blob enters FormData. Output remains within the server's 5 MB limit.
Source bounds are 40 MB / 64 million pixels; arbitrary SVG and other files are
rejected. Browser-local preparation occurs before consent creation/upload.

Preparation, upload, success and failure appear beside the upload action.
An invalid replacement preserves the existing session. Consent withdrawal
clears stale success text and analysis access. The separate analysis button
remains required. Native validation, server bounds, private S3, policy, quotas,
provider configuration and semantic rollout are unchanged.

HEIC uses the browser's decoder; unsupported decoding has a specific fallback
message. Physical iPhone HEIC selection and real-photo analysis remain pending.

## Evidence

- Local byte-signature/aspect-ratio/bounded-dimension checks passed, including
  48 MP input dimensions, empty/invalid input and no upscaling.
- [Isolated browser review 40566440302](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40566440302):
  passed typecheck, web export, existing customer/business journey and photo
  checks in Chromium and WebKit. A synthetic PNG over 5 MB becomes a 1600x1200
  JPEG; checks cover metadata removal, consent gating, invalid replacement,
  withdrawal and upload rejection. Every API request was mocked; no paid AI call.
- [Exact candidate build 40567172334](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40567172334):
  pinned file hashes, original ORZELL sources/emblem preserved, offline typecheck
  and web export passed; all live containers remained unchanged. Formatting-only
  source updates produced the same candidate image as the preceding build.
- [Gateway publication 40567391128](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40567391128):
  local candidate markers, public HTTPS/new photo JavaScript, both API readiness
  and CORS checks passed. API, worker, database, secret helper and admin IDs/start
  times were unchanged. No migration, IAM/capacity or photo-policy change.
- [Exact-source browser review 40567101674](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40567101674):
  formatting, typecheck, web export and existing unit checks passed; the final
  browser-tooling installation was still running at this verification. The
  preceding corrected Chromium/WebKit review above passed the same functional
  photo code; both source-formatting variants produced the identical image ID.
- [Live synthetic upload 40567617804](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40567617804):
  SUCCESS. A real HTTPS browser login and consent uploaded a synthetic PNG over
  5 MB through the deployed UI; the private upload and session creation returned
  HTTP 201 and persisted CREATED, with the success message and analysis button
  visible. No analysis request or page runtime error occurred. Synthetic consent
  was withdrawn, consultation access denied and refresh sessions revoked. Only
  synthetic pixels were used. Physical erasure remains pending the normal worker;
  this run does not certify physical absence. The synthetic customer/audit record
  remains; no database rows were deleted.

The first isolated WebKit harness run failed because its request inspector omits
multipart file bytes. The corrected harness observes the actual FormData Blob
at fetch before sending the unchanged request to its mock. This was a test
instrumentation issue; both engines passed the corrected check.

## Runtime and rollback

Customer URL: https://preview.13-51-112-228.sslip.io/

Current gateway:
`sha256:c088ae1f4407caea77d37786265720c0b7302f12ec4b2f68736cd71ac33fa0bc`.

Retained previous gateway:
`sha256:be20529c1e0c9e1d8ab03109079d8e3c1d6b2acf85374a0e8155b3de2dfdf1a2`.

Gateway Compose env:
`/opt/epifiz/operations/photo-picker-20261027/publish.env`;
previous image env: `rollback.env` in the same folder. Both use the original
Compose file and `booking-context-20261022/mvp.yml`; only gateway is recreated.
The publication script verifies provenance and preserves unrelated containers,
and restores the old gateway on failed public acceptance. It deliberately
refuses re-execution once the prior image is no longer active.

Build/publish scripts are recorded alongside this document in the operations
review. The source PR remains draft; no main application merge, Stage 33 PASS,
physical device/native installation or store release is claimed.
