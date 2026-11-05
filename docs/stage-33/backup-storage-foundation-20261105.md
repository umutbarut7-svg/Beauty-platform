# Dedicated backup storage foundation — prepared, not applied

`infra/operations/bootstrap-backup-storage.py` is an account-owner CloudShell
entry point. Default invocation emits a plan and makes no AWS calls;
`--print-template` emits its CloudFormation JSON for review. Only `--apply`
requests a new fixed stack in account `926642724499`, region `eu-north-1`.

The existing GitHub operations bridge is intentionally limited to SSM commands
and host inventory; its bootstrap grants no CloudFormation/IAM administration.
Do not broaden that bridge, create an administrator credential, reuse an OpenAI
key or transfer the user's recovery private key to establish this foundation.
The owner runs this one-time setup using their existing AWS account session.

## Concrete proposal

- New bucket: `orzell-backups-926642724499-eu-north-1`.
- Object prefix: `encrypted/v1/`; no use of the existing photo bucket.
- Owner-enforced ACLs, all public access blocks, AES256 default server-side
  encryption and versioning enabled. Bucket policy denies non-TLS requests and
  PutObject without an explicit AES256 SSE-S3 request header.
- One named inline policy on the **existing** role attached to the fixed host.
  It allows bucket-safety metadata, PutObject/GetObject only in that new prefix
  and explicitly denies deletion of those objects and versions by the runtime.
  It does not change role trust, instance profile, existing policies or services.
- Bucket deletion/replacement policy is Retain. No lifecycle expiration,
  irreversible Object Lock, compute instance, KMS key, credential, backup dump,
  scheduler or paid AI request is created.

Retention and cost bounds still need operational acceptance: no expiration means
backup versions accumulate once uploads begin. The proposal does not claim an
approved retention period or RPO/RTO and does not start uploads automatically.
Server-side encryption is additional to the client-side CMS encryption; this
foundation cannot inspect or guarantee the content format of an uploaded object.

## Guarded application

Before create-stack, the helper verifies the fixed account, running host and its
single existing instance-profile role; that role must trust EC2 only. It refuses
an unmanaged policy with the target name or an existing bucket instead of
adopting/overwriting either. Denied reads are failures, never treated as absence.
An existing completed stack must have the exact template and role parameter;
it is left unchanged and is not labeled production-ready. A failed/in-progress
or different stack stops for inspection. No stack update/delete path exists.

AWS ValidateTemplate precedes the one CreateStack request. The returned status
is only STACK_CREATE_REQUESTED. Creation still needs observation and effective
write/recovery verification. An uncertain response is not automatically retried;
the operator must inspect this fixed stack and the initial request token.
Retain can leave the new bucket behind after a later stack failure, so a failed
create must not be blindly rerun or cleaned up by deleting stored objects.

Ten offline boundary tests exercise account/host/profile/role rejection, broad
trust, existing-resource protection, matching-stack no-op, changed/failed stack
rejection, uncertain response, no-network plan and diagnostic redaction.
The generated template is validated by pinned cfn-lint 1.59.0 against the real
CloudFormation schema. CI receives no AWS identity and performs no live setup.

The user's saved recovery key and the installed public certificate remain
unchanged. Production signing-key operation, automated upload, monitored
scheduling, retention/RPO/RTO, isolated independent recovery and all other
Stage 33 acceptances remain separate. Stage 33 **NOT PASS**.
