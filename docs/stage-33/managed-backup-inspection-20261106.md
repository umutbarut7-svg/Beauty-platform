# Post-activation backup inspection

The first backup at activation does not prove the later scheduled job ran. This
separate operation reads the installed configuration, hashes of the five pinned
tools, exact systemd units and absence of overrides, enabled/active timers,
service exit results, private backup state and the corresponding success receipt.
Only the latest receipt's fixed daily object is inspected with S3 HeadObject.
Current version, length, SHA256 checksum and AES256 must match the original
verified upload receipt. There is no object listing, body download, database
read, private-key access, backup restart, metric publication or service change.

The cloud audit independently rereads the reviewed template, IAM/bucket policy,
30-day lifecycle and alarm configuration, including the actual current alarm
state. An alarm without an action remains a console alarm; this operation adds
no email/SMS notification route.

The host check rejects failed, abandoned, future or older-than-26-hour success
state, configuration/tool/unit drift, disabled timers and metadata mismatches.
After 00:15 UTC it separately requires a backup from the current UTC day; before
then the previous day is allowed. The quarter-hour grace covers timer accuracy
and the bounded service deadline. A changed state or application snapshot during
inspection is an inconclusive read, not a reason to start another backup.

The fixed request uses existing main-only OIDC roles and the shared server
operation concurrency group. Pull-request tests have repository-read access
only, with all cloud and host responses explicitly simulated. The main merge
triggers just the read-only inspection. No schedule or recurring notification
is introduced by this change.

This is operational continuity evidence, not independent recovery. A real
production restore still needs the owner's separately held recovery key in a
protected offline workspace, a separate database, account/photo quarantine,
tenant/inventory/B2B integrity checks and measured recovery time. The live
application must not be the restore target. Stage 33 remains **NOT PASS**.
