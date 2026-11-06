# Same-account recovery rehearsal host candidate

The owner has only the existing AWS account. Use that constraint without asking
for another account again. A separate host can test restoring the backup while
the production host is unavailable; it cannot prove recovery after account loss,
account compromise or provider-wide failure. The independent-account acceptance
remains separate.

`plan-recovery-host.py` prepares a candidate CloudFormation template and reads
regional pricing. It **cannot provision, update, terminate or delete anything**.
Its default and print-template modes are offline. The main-only inspection uses
the existing audit role to read caller identity, the public AL2023 AMI parameter,
Amazon-owned image metadata and two exact Price List products. A failed or
ambiguous price remains unverified; no new IAM permission is requested.

## Reviewable candidate

| Item                 | Prepared setting                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Region / compute     | eu-north-1, one t3.medium, two vCPU / 4 GiB                                                                 |
| CPU surplus          | Standard credits; no Unlimited surplus billing                                                              |
| Disk                 | 20 GiB encrypted gp3, delete on instance termination                                                        |
| Network              | New separate VPC/subnet; no peering, inbound ports or SSH key                                               |
| Outbound             | HTTPS only, for SSM and public package/image setup                                                          |
| Address              | One temporary public IPv4; no Elastic IP or NAT gateway                                                     |
| Instance profile     | Five documented minimum SSM agent actions and readiness signal to its own stack                             |
| Production access    | Explicit deny for S3, Parameter Store values, secret values and KMS decrypt; no production role is reused   |
| First probe          | Hash-pinned existing synthetic PostgreSQL/pgvector tmpfs/container rehearsal; default active-swap rejection |
| Bootstrap acceptance | CFN waits up to 15 minutes for a successful readiness signal                                                |
| Expiry               | First bootstrap operation schedules termination after 120 minutes; failure also requests immediate shutdown |
| Private material     | No recovery key, encrypted production package or production rows accepted                                   |

The instance shutdown behavior is terminate. Both the root volume and network
interface are configured for deletion. The operating-system expiry and CFN
rollback are **best effort**, not a hard billing cap or a verified termination.
A future operator must confirm the instance is terminated and clean up its own
stack; this plan does not silently delete any stack. No resource has been created
or tested in AWS by preparing or linting the template. Existing account session
preferences can require additional KMS permissions; they are not changed or
bypassed, and that incompatibility must be reviewed before actual operator use.

## Cost review

The inspection queries the exact Stockholm Linux/shared t3.medium on-demand rate
and gp3 storage rate. It adds the documented $0.005/hour public IPv4 charge and
prorates 20 GiB storage using a 30-day planning month. It reports a two-hour
estimate and whether that estimate is below a $1 planning budget. This is **not
approval** to spend or a guarantee of a $1 maximum; taxes, data transfer, billing
rounding and failure to terminate are excluded. Do not substitute US-region T3
example prices for a missing Stockholm quote. No Free Tier benefit is assumed.

## Next gates

Before a real deployment, obtain the actual quote and approval for the new paid
host and narrow instance role. A first deployment is synthetic-only. Its actual
expiry, role/policy, Docker/kernel isolation and session route must be inspected
before a protected real-key intake, pinned ciphertext transfer, bounded restore
controller and current-schema quarantine are accepted. This template contains
no real-key intake or production restore service. Stage33 remains NOT PASS.

Primary AWS references, checked 7 November 2026:

- [Minimum Session Manager role](https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-create-iam-instance-profile.html)
- [CreationPolicy and signal timeout](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-creationpolicy.html)
- [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/)
- [EBS pricing and prorating](https://aws.amazon.com/ebs/pricing/)
- [T3 specifications and regional price limitation](https://aws.amazon.com/ec2/instance-types/t3/)
