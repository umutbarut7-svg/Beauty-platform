# Read-only recovery snapshot binding

The recovery preparation workflow reuses the existing full cloud audit and
host health/receipt inspection. Its explicit fixed request exports a small
allowlist from the same successful receipt that matched the current S3 head:
object key, immutable version ID, package byte count/SHA256, exact backup/source
identity, independently recorded signer/recipient pins and a narrow UTC window
from backup start to successful verification. It does not select a file from an
untrusted package, relax the existing inspection, or open a new AWS operation.

The previous inspection output stays unchanged unless the exact recovery export
request is supplied. The export additionally rejects a missed due snapshot,
unsafe/unbounded version strings and backup windows exceeding the existing
eleven-minute service deadline. Unrelated receipt fields are not exported.

This is **metadata only**. No S3 get-object, package/DB body read, private key
access, decryption, restore, service change or cloud provisioning occurs. The
existing runtime role checks only its fixed identity and S3 head metadata. The
GitHub role uses the same SSM read transport on the same existing instance.
No authentication credential or public/private key content is included.

The descriptor is an observation from the verified host receipt, not a signed
independent approval or a guarantee the encrypted package can be decrypted.
Expected signer/recipient pins remain fixed outside the package; a later offline
consumer must independently approve the backup/source/time context, retrieve
this exact S3 version with the existing authorized download path, enforce actual
size/SHA256 and authenticate the signed inner manifest before decryption.

The private recovery key remains with the owner. A phone-controlled CloudShell
with active host swap has passed neither protected real-key handling nor an
independent production restore. Do not supply that key to CloudShell, CI,
production, or this inspection workflow. No paid recovery host is created.

The next unresolved environment requirement is a protected offline Linux/Docker
workspace with no active swap, sufficient RAM, no production volume/listener or
cloud/provider credential in the restore container, bounded cleanup and a
reviewed current-schema quarantine before any application is opened. Current
synthetic CI and metadata success cannot close that requirement. Stage33 remains
NOT PASS until the real restore, measured RTO and other open acceptance gates
are completed.
