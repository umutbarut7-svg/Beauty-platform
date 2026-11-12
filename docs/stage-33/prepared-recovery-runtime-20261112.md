# Separate prepared recovery runtime

IMG_2637.png (12 November, screen time 21:45) reports
`PREFLIGHT_PASSED_NO_RESOURCES_CREATED`: Stockholm t3.small, AMI
`ami-048b77d5ca32f6d32`, Free Tier eligible, two-hour estimate
USD0.057844444444… excluding tax and data transfer. It is not a hard billing cap
and is not a new host, runtime acceptance, real restore or spending approval.
The returned template hash `7dda1cc2…ad6886` belongs to the old synthetic plan.
Do not recreate that already completed and deleted rehearsal for the new scope.

## Concrete proposed scope

The new owner operator `prepare-protected-recovery-host.py` targets the distinct
`orzell-protected-runtime-v1` stack. It reuses the pinned small planner's actual
identity, FREE/ACTIVE plan, t3.small/AMI eligibility, regional pricing and broad
project/orphan inventory checks. It requires a fresh estimate no higher than
USD0.06 for two hours; a missing/ambiguous/ineligible/over-budget result stops.
The old synthetic spending approval does not approve this new scope.

The baseline's eleven network/role/host resources, no ingress, HTTPS egress,
EC2-only five-action SSM role, denied production S3/parameter/secret/KMS reads,
IMDSv2, standard CPU credits, 20 GiB encrypted disposable gp3 disk and best-effort
120-minute termination remain unchanged. Only bootstrap, host DataScope
`PreparationOnly`, description and purpose change. No blanket GitHub cloud role
or new production-read permission is added.

Bootstrap installs vendor packages (Docker, Python cryptography, OpenSSL, CFN
bootstrap), downloads seventeen allowlisted public code/certificate/reference
files from reviewed source `0db36282e3a2221e391c2649d29735a3fd8e2d0b`, checks
each exact SHA256 and makes the files root-readable only. The digest-pinned
PostgreSQL/pgvector image is pulled before intake. A public runtime probe checks
imports, active-swap rejection, core 0, actual memfd seals, image digest and SSM
agent readiness. It does not repeat the old synthetic database rehearsal.

This bootstrap installs neither a receiver nor a live file picker. It does not
download a backup, accept the owner's key or restore customer rows. Its success
signal means public runtime preparation only. Host trust and full live
infrastructure/session/runtime inspection, trusted client/challenge delivery,
independent review and actual restore remain subsequent acceptance boundaries.

## Operator behavior

- No arguments: `OFFLINE_NO_ACTION`, no provider call or download.
- `--print-template`: offline exact template for review and linting.
- `--preflight`: the new scope's fresh read-only hardware/cost/inventory check.
- `--create-prepared-runtime`: explicit new-scope owner action after approval;
  no automatic update/delete/retry of an existing stack. It records a private
  local attempt before submitting the one create request, rechecks identity and
  absence immediately beforehand and uses a fixed idempotency token.
- `--status`: read the new stack and project instance inventory. If submission
  times out or is ambiguous, use status; do not delete the attempt latch and
  retry creation. CREATE_COMPLETE still does not mean real recovery readiness.

The original host/stack is never a mutation target. The default owner attempt
directory is `~/orzell-protected-runtime-attempt-v1`. CloudFormation rollback and
the OS timer are best effort; they are not a spending cap or observed resource
cleanup. Owner-approved preparation must include checking actual termination
and later removing this exact temporary stack's remaining resources.

Eight focused test groups exercise fixed public source pins, new scope and
unchanged infrastructure, cost/eligibility/existing-orphan boundaries, receipt
permissions, single submission, pre-create races, ambiguous outcomes and
symlink/attempt latches. CI lints the exact template with cfn-lint1.59.0 without
cloud credentials. Existing application/CMS/browser acceptance is retained;
there is no new real data or device acceptance. Stage33 remains **NOT PASS**.
