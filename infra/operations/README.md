# Preview operations bridge

Owner-authorized bridge for `umutbarut7-svg/Beauty-platform`, `main`, and the
existing preview instance `i-09fe7fdb5f10d63b6` in `eu-north-1`.

The one-time CloudShell `bootstrap.py --apply` creates only the dedicated
`BeautyPlatformPreviewOperations` IAM role and its inline policy. It verifies
the AWS account, existing GitHub OIDC provider and running instance first.
It does not create keys, change existing roles, provision paid infrastructure,
change the instance profile, or alter running services. Existing mismatched
roles/policies are rejected rather than overwritten. Repeating a completed
setup makes no changes. A partial new-role setup can be completed by rerunning.

Credentials are temporary OIDC credentials restricted to this repository's
`main` branch. The role can send `AWS-RunShellScript` commands to **one server**;
SSM shell execution has administrator privileges on that host, including access
to its files and runtime identity. This is host management authority, not an
AWS account administrator role. AWS resource creation/deletion, IAM changes,
and direct Parameter Store/KMS secret access are not granted to the GitHub role.
SSM command-result/inventory reads are account-wide in the fixed region because
the corresponding read APIs do not provide per-invocation resource restriction.

The initial checked-in operation only reads RAM, disk, running container names,
status and usage. Do not print environment variables, container inspect output,
application secrets, database contents, or unreviewed application logs: this
repository and its Actions logs are public. Do not place plaintext secrets in
SSM command text, which AWS retains in command history.

For later authorized work, update `.github/operations/preview-commands.sh` and
change `preview-request.json` to a unique request ID in one reviewed main commit.
This triggers Actions without the owner copying terminal commands. The connector
can read run status and logs. There is no background listener, schedule, arbitrary
workflow-input shell, or PR-triggered privileged execution. `inspect` is a label,
not a sandbox: scripts must be reviewed in every commit. Future non-read-only
scripts use `approved-maintenance` after the relevant owner authorization.

Owner approval is required before data deletion, high-cost changes, production
deployment, IAM expansion, migrations with data impact, or credential rotation.
This is an operating rule; it is not enforced by the mode field or AWS IAM inside
the host shell. Never infer approval from a JSON field alone.

Activation is not verified until an actual Actions run assumes the new role and
finishes the host inspection successfully. An IAM setup message alone is not
proof of a working bridge. To revoke, remove the dedicated role's inline policy
or its trust from the owner's AWS session. Do not delete application resources.
