# Owner t3.small recovery preflight — 11 November 2026

The approved owner-side small plan was prepared outside the repository, while
the shared planner still defaults to t3.medium. start-small-recovery.py makes the
already approved small scope reproducible without changing that existing planner
or granting a GitHub role provisioning permissions.

The owner explicitly previously approved the fixed small rehearsal below the
USD0.101044 two-hour estimate (tax/data transfer excluded). This is an owner-run
operator, not automatic deployment and not a new blanket spending approval.

## Modes and gates

Default: offline summary; no network or resource. --preflight: read-only account,
project-wide instance inventory, exact stack, FREE/ACTIVE account plan, t3.small
type/AMI eligibility and fresh exact Stockholm pricing. It downloads the immutable
public planner only after an operator mode is selected, checks its SHA256 and
uses its unmodified template with only INSTANCE set to t3.small. Canonical template
SHA256 stays 7dda1cc25183b7d3283e9aaa7ca4c5fa136b8384b28f97be96136381f2ad6886.

--create-reviewed-synthetic-host performs that preflight, template validation and
an immediate second identity/resource check, then submits exactly one create.
It neither updates nor deletes an existing stack and never upgrades the account.
An existing stack, any active Project=ORZELLRecoveryRehearsal host including one
missing other tags, truncated inventory, unavailable read or ineligible product
blocks creation. A locally recorded attempt blocks another create even after a
timeout. AWS_MAX_ATTEMPTS=1 also disables CLI retry of an ambiguous mutation.
Raw AWS error text is not printed.

Only Free Tier and Price List use the global us-east-1 endpoints; all regional
resource/stack operations are fixed to eu-north-1. Eligibility does not claim
zero cost, credits availability, a hard budget cap or successful termination.

--status reads the exact stack and project-tagged instances without creating
anything. CREATE_IN_PROGRESS is not bootstrap success; even CREATE_COMPLETE is
not real-key/production restore acceptance. If create times out, use --status;
do not remove the attempt directory and rerun create to bypass the latch.
Status inspection does not establish complete residual volume/network cleanup.
The original bootstrap retains encrypted disposable disk, no inbound ports,
minimum SSM agent actions, denied production reads, strict no-swap synthetic
probe, 15-minute readiness signal and best-effort 120-minute termination.
Actual termination and stack cleanup still require observation.

No private key, production package, SQL row or provider credential is accepted.
There is no real-key intake or protected real restore controller here. Do not
paste the saved recovery key into CloudShell. This is the prerequisite synthetic
host step only; Stage33 remains NOT PASS.

## Validation and execution boundary

Fifteen new local tests passed: existing/in-progress stack, orphan project host,
pagination, wrong account, account plan, both eligibility gates, unrounded cost,
canonical-template drift, preflight race, pre-create receipt, ambiguous create
latch, endpoint/retry binding, exact absence/error redaction and operation allowlist.
Offline default and Python compilation passed. No AWS call or resource was made
in this workspace. The dedicated PR workflow runs these boundaries without cloud
credentials; existing application acceptance is unchanged.

This workspace has neither an AWS CLI nor AWS credentials/outbound identity.
The GitHub app can publish this reviewed source but cannot run an owner AWS
session. Execution must occur in the owner's existing authenticated CloudShell.
The final command must pin this script to the reviewed commit and verify its
SHA256 before explicit --create-reviewed-synthetic-host invocation. No new account,
account-plan upgrade, recovery-key upload or IAM permission expansion is requested.

Primary sources checked 11 November:

- https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-instance-types.html
- https://docs.aws.amazon.com/cli/latest/reference/freetier/get-account-plan-state.html
- https://docs.aws.amazon.com/general/latest/gr/billing.html
