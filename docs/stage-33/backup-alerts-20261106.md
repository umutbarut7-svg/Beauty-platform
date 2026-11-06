# Backup alarm email delivery

The owner selected **orzellapp@gmail.com** for backup warnings on 6 November.
The fixed candidate adds an SNS topic, a policy allowing only the existing health
alarm to publish, and one email subscription. The exact account and source alarm
ARN constrain the service policy; TLS is required. ALARM and recovery-to-OK
notifications use this topic. The metric, missing-data behavior, 30-day retention,
bucket policy, runtime IAM policy, timers, database and application are unchanged.
No new compute, identity, key or KMS resource is introduced. Alert messages contain
operational health state; no customer records, backup contents or recovery keys.

## Owner step and verification

The existing GitHub management identity can run commands only on the existing
server. It does not have CloudFormation/SNS provisioning permission. Run the
reviewed immutable `approve-backup-alerts.py --apply --wait-and-send-test` source
in the owner's CloudShell; the default invocation is an offline plan. The helper
checks the exact stable prior template and live alarm before updating the same
stack. An unrelated existing topic name, drift, wrong account or unstable stack
stops before an update. No new management permission is requested.

The subscription confirmation email must be confirmed by its recipient. Waiting
is bounded separately for stack completion and email confirmation. A repeated
apply on the approved template does not recreate the topic or subscription. The
explicit test option can publish one synthetic diagnostic after confirmation;
it does not change alarm state or send a fake health metric. An uncertain publish
is not automatically retried. Do not blindly repeat the command after a timeout
or unknown result; inspect its existing log and the read-only audit first.

The read-only workflow accepts the exact previous template or this exact approved
extension and reads the actual topic policy, live alarm actions, sole endpoint,
confirmation and absence of a subscription filter. Extra recipients or a route
which could silently drop notifications are rejected. A confirmed subscription
is **not inbox-delivery evidence**. SNS accepting the synthetic test is also not
inbox delivery: the selected inbox must contain the returned unique test marker.
The status fields keep these claims separate.

At preparation time no subscription, email, infrastructure update or production
restore has occurred. Real restore, deletion operations/retention, independent
review, device and photo-quality acceptances remain open. Stage 33 is NOT PASS.

Primary reference: [AWS CloudWatch alarm notifications](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html).

## Reviewed rollback repair, 7 November

The actual read-only audit at 6 November 21:37 UTC observed
`UPDATE_ROLLBACK_COMPLETE`, `BackupAlertPolicy CREATE_FAILED / InvalidRequest`,
and the dependent alarm update failure. This is not an email-confirmation wait.
The original topic policy used `sns:*`, which includes actions outside SNS topic
resource-policy scope. The repair enumerates the eleven documented topic-policy
actions in the TLS deny and adds a fixed policy Id. The existing source-alarm and
account restrictions remain exact. The event diagnostic distinguishes an actual
out-of-scope action message from other invalid configuration errors; until that
specific observation, this is a source defect consistent with the real failure,
not a claim that the full provider reason was read.

Use the explicit `--apply --resume-after-reviewed-rollback --wait-and-send-test`
owner command. The rollback exception accepts only `UPDATE_ROLLBACK_COMPLETE`,
and still requires the exact original template, role binding and live original
alarm. In-progress/failed rollback and any drift remain rejected. A distinct
fixed `ORZELL-Backup-Health-Alerts-v2` topic avoids adopting or deleting a v1 topic
that may have been retained outside the stack. The old topic's existence is not
yet verified and cleanup is not performed. The new topic uses
`RetainExceptOnCreate` so a failed first creation will not leave another retained
unused topic. The stack, backup bucket/policies, retention and timer setup stay
the same. No automatic apply or provisioning permission is added to GitHub.

Local tests and CloudFormation schema checks validate preparation only; owner
execution, actual stable stack/route, recipient confirmation and inbox delivery
remain separate acceptance steps. Do not reuse the original v1 command.

References: [Valid SNS topic-policy actions](https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-language-api-permissions-reference.html),
[TLS policy example](https://docs.aws.amazon.com/sns/latest/dg/sns-security-best-practices.html),
[RetainExceptOnCreate](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html).
