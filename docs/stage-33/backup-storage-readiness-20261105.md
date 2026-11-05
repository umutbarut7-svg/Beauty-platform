# Backup storage readiness inspection

The main-only `inspect-backup-storage.yml` operation uses the existing
`BeautyPlatformGitHubAudit` identity. It checks the expected account and role
before reading S3 bucket configuration. Pull requests run offline tests only;
they receive no AWS identity. A fixed request file starts the live read after
the reviewed change is merged into main.

The reader is restricted to an explicit allowlist: identity, bucket inventory,
location, public access blocks, encryption, versioning, lifecycle configuration,
Object Lock configuration and public-policy status. Bucket reads bind the
expected owner. It does not enumerate object names, read object data, inspect
customer records, retrieve keys, upload backups, change policies or contact the
running database. Reports contain ordinal bucket aliases, never bucket names,
resource identifiers or raw provider diagnostics.

Access denied and missing response fields remain UNKNOWN. A missing lifecycle
or Object Lock configuration is distinguished from a permission failure. More
than 20 buckets or an unsuccessful inventory yields INCOMPLETE. An enabled
lifecycle rule count does not prove that rules cover a backup prefix or provide
approved retention. Server-side encryption is distinct from the existing signed
client-side CMS encryption.

Six offline tests cover redaction and owner binding, denied reads, absent
configuration, incorrect identity, incomplete inventory and rejection of writes.
Live results are recorded only after the main-only operation completes.

This inspection cannot establish effective write/recovery permissions, select a
production backup destination, approve retention/RPO/RTO, provide independent key
custody or prove a working backup schedule or recovery. Those remain production
acceptance gates. It changes no live services, keys, data or resources.

Stage 33 remains **NOT PASS**.
