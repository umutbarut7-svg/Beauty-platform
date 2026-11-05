# Backup storage verification after owner setup

The user ran the reviewed owner CloudShell helper and supplied an iPhone screen
showing STACK_CREATE_REQUESTED. This establishes request acceptance, not completed
CloudFormation creation, effective access or a working production backup.
Do not rerun the owner create command merely to check its status.

## Ordered verification

The main-only fixed request first uses the existing audit identity to read:
CREATE_COMPLETE, exact reviewed template, runtime-role parameter/output binding,
the actual named writer policy, actual TLS/SSE bucket policy and default AES256
encryption. Policy list/action ordering is normalized without ignoring extra
permissions or changed conditions. Unavailable reads or pending/failed stacks
stop the operation. No policies or resources are changed by this audit.

Only successful audit output allows the existing OIDC/SSM bridge to run one host
probe. It checks the exact runtime identity, enabled versioning, all four public
access blocks, installed pinned public certificate and conditional/checksum CLI
support. It uses no database command or user private key.

The probe encrypts a small random synthetic message with AES-256-GCM CMS and the
installed public RSA-OAEP recipient. It publishes a private local ciphertext and
durable started marker before one deterministic If-None-Match upload into
`encrypted/v1/diagnostics/`. Explicit SSE-S3 and SHA256 checksum headers are used.
A latest-version GetObject is bound to ETag, returned version and SHA256; the
runtime intentionally lacks GetObjectVersion. It then expects AccessDenied for
both deleting this diagnostic object and deleting its specific version. If a
negative check unexpectedly succeeds, only that synthetic diagnostic is affected
and the check fails. No customer/production object is selected or listed.

Upload/read receipts and the final result are private files. Any started marker
prevents an automatic upload retry, including after an ambiguous network result.
The create-only S3 condition also prevents overwriting a pre-existing diagnostic.
The diagnostic encrypted object remains stored; no cleanup exception or broader
delete permission is introduced. Exact API/worker/PostgreSQL identity, image,
start time and restart counts must remain unchanged.

Seven audit tests and eight host-probe tests cover incomplete/drifted metadata,
identity and policy boundaries, real public-certificate CMS encryption, exact
single-object/checksum controls, ambiguous upload replay, corrupt readback,
missing delete protection, old CLI and private certificate permissions. All AWS
calls in PR tests are explicit fakes; CI has no AWS identity. Main execution and
actual results are recorded separately after merge.

This proves only the stated storage checks. It creates no production database
backup, signer private key, schedule, monitoring, approved retention/RPO/RTO or
independent recovery. The user's private recovery key is not transferred or used.
Stage 33 remains **NOT PASS**.
