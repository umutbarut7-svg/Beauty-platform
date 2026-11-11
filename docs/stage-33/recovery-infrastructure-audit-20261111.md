# Recovery infrastructure metadata audit — 11 November 2026

The owner demonstrated CREATE_COMPLETE, the actual successful synthetic restore
log and an expiry timer with approximately 1h30 remaining at capture. Those are
accepted observations; the synthetic restore must not be repeated to inspect
the AWS infrastructure. Actual timer execution/termination is still unobserved.

This owner-run audit checks live metadata against the original approved small
template and the local v4 submitted/attempt receipts. It cannot create resources,
change permissions, read a backup body or accept a private key. The default is
offline; --inspect explicitly enables only the fixed metadata read allowlist.

## Exact checks

- Exact owner account, submitted Stockholm stack ARN, CREATE_COMPLETE and AMI.
- Original deployed template canonical SHA256 and exact completed resource set.
- Actual running t3.small, AMI, project/synthetic/stack tags, VPC/subnet/firewall.
- Applied IMDSv2 and hop limit, standard CPU credits and terminate-on-shutdown.
- One 20GiB encrypted gp3 root disk at baseline IOPS/throughput, exact attachment,
  delete-on-termination for disk and interface.
- No security-group ingress, HTTPS-only IPv4 egress and exactly local/public
  routes through the stack's own internet gateway; no additional reachable route.
- Exact instance profile and EC2-only trust; no extra inline or attached policy;
  only the reviewed SSM/readiness actions and explicit production-read denies.

Pagination, unavailable metadata, mismatched receipts or any unexpected live
setting stops acceptance. Raw AWS errors/policy bodies are not printed. All
reads use the owner's existing session; the audit requests no new permission.
It adds no workflow with cloud credentials or automatic owner action.

## Scope of a successful result

RECOVERY_INFRASTRUCTURE_BINDING_PASSED is a point-in-time infrastructure binding
result, not an attestation of a trustworthy root administrator, account-loss
recovery, unmodifiable configuration, full residual cleanup or protected key
handling. DataScope remains SyntheticOnly. realRecoveryReady and
productionRestoreVerified remain false even after every metadata check passes.
Runtime/session logging review, protected ciphertext/key intake and bounded
offline restore/current-schema quarantine remain separate gates. Production
data must not be inferred authorized for this target from a synthetic result.

The audit does not disable the existing expiry timer, extend the host lifetime,
alter the live app or repeat PostgreSQL restore. Final termination and stack
cleanup still need observation. A later private-material operation needs fresh
checks because the owner/root can change configuration after this snapshot.

## Validation

Twelve local boundary scenarios cover canonical template/resource drift, account,
host/image/network and IMDS changes, disk/credits/termination, ingress/egress and
extra routes, role/profile scope, uncertain/paginated reads, redacted failures,
the metadata-only allowlist and receipt/symlink handling. CI runs without AWS
credentials. These fixture results are not a live infrastructure audit.

Primary API references checked 11 November 2026:

- https://docs.aws.amazon.com/cli/latest/reference/cloudformation/list-stack-resources.html
- https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instance-credit-specifications.html
- https://docs.aws.amazon.com/cli/latest/reference/iam/list-role-policies.html
