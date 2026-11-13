# Owner-operated isolated recovery session

**13 November update:** the originally approved stack incarnation and its 11
CloudFormation resources were deleted by the owner. `DELETE_COMPLETE` and the
empty non-deleted-resource filter are recorded. The original operator remains
bound to that deleted incarnation and must reject a new start. This update does
not provision, authorize or rebind a replacement host. The owner's previous
capsule paste has no observed success/failure receipt; its expired session cannot
be replayed and is not counted as a completed restore.

This completes the missing operator path from the approved temporary host to
the existing Web Crypto / signed-package / sealed-memory / offline PostgreSQL
controller. It does not enable production reopening or mark Stage 33 passed.

## Fixed scope

- Account `926642724499`, region `eu-north-1`, existing instance
  `i-014e0cd851bcd4169`, exact approved CloudFormation stack incarnation.
- Only the approved version of `orzell-database-20261112.zip`, 667576 bytes,
  full-package SHA256
  `0125b3789379511b52c8a61dbb24f2b847d34626f2a51562fe2a0bc2fa2d1221`.
- The CloudShell operator checks the authenticated account, exact stack outputs
  and running instance. It does not create, restart or extend a host, modify IAM,
  access a private key or change the production database.
- A 180-second presigned GET transfers only the exact encrypted S3 object version.
  The capability is kept in a private temporary parameter file; it may be present
  in owner AWS/SSM command records. No plaintext key is sent to those services.
- The root runner checks all 17 public runtime hashes, no inherited provider/DB
  credentials, no swap and core-dump disablement. A generated RSA-OAEP/AES-GCM
  provider probe runs before owner input, including on the observed crypto 36.0.1.
  Boot age over 100 minutes rejects intake without extending the expiry timer.

## Owner phone flow

1. Run the immutable, hash-checked CloudShell operator with
   `--start-approved-isolated-restore`. Keep that SSM session open.
2. Copy its public `challengeBase64` and `challengeSha256` into the separate
   private HTTPS client. The pin comes from the authenticated owner AWS channel,
   not from a downloaded package or client-generated value.
3. Only after the fixed backup context and pin pass, select the existing
   `ORZELL-Kurtarma-Anahtari.txt` on the phone. The client extracts exactly one
   private PEM block, ignores surrounding explanatory/public-certificate text,
   and wraps it locally with Web Crypto. No fetch, storage, analytics or upload
   endpoint exists. A hash-pinned CSP denies network connections.
4. Copy the encrypted capsule, including its two marker lines, into the waiting
   SSM session. Each encoded line is at most 256 characters to avoid terminal
   canonical-line truncation. Never paste plaintext PEM into CloudShell or chat.
5. The runner authenticates the exact package again, decrypts into sealed memfd,
   restores into the existing network-none/tmpfs PostgreSQL controller, checks
   schema, tenant/inventory/B2B/material invariants and access/photo quarantine,
   and verifies removal of its disposable database. Only non-content evidence is
   printed. Provider secrets and production services remain outside this scope.

## Saved non-content owner result

Distribute `recovery-result-receipt.py` alongside the hash-checked operator. The
operator verifies the helper's SHA256 and executes those same verified bytes.
Before opening SSM it reserves a new random attempt under
`$HOME/orzell-recovery-results/<receiptId>/result.json` on the owner's CloudShell.
The base/attempt directories are owner-only `0700`; files are `0600`. Writes use
descriptor-relative exclusive temporary files, atomic replacement and fsync.
An empty private `started` marker is created once for attempt ordering; later
updates to an older result cannot hide a newer incomplete attempt.
Symlink/permissive base directories and symlink/nonregular result files are
rejected. No previous attempt is overwritten.

The child's stdin remains the owner's terminal. A local output PTY preserves
TTY output for the SSM plugin. Output is mirrored, but **no transcript, stdin,
capsule, challenge, URL, PEM, DB row or arbitrary error string is written** by
the result recorder. Output parsing holds at most one 8 KiB line; oversized,
partial, duplicate-field, stale-ID or invalid reports are ignored. Terminal
echo may transiently pass through this bounded output buffer; this is not a
physical RAM-erasure guarantee. Existing AWS/SSM records are a separate channel.

The runner tags terminal outcomes with the random attempt ID supplied through
its fixed command. Only typed allowlisted flags, fixed status values, UTC
timestamps, durations and the independently bound application SHA can persist.
Successful restore evidence also requires the existing cleanup/domain/handoff
checks, `network=none`, no public ports and all production-reopening flags false.
Synthetic receipt checks keep actual-backup/production-data flags false. A stopped
then rejected attempt retains whether capsule submission was observed, without
claiming whether a private key was successfully read. Conflicting terminal
outcomes remove the success claim.

The initial file says `RESULT_NOT_OBSERVED`. Exiting with code zero, disconnecting,
timing out, or reopening a blank terminal cannot convert that into restore success
or failure. A complete valid result is fsynced before it is mirrored to the screen.
The output reader has a 1200-second transport bound; this does not extend the
existing host or server-side 900-second timeout. A parent/host crash before result
observation can still leave an unresolved attempt; the file does not prove that
no private material was processed. CloudShell home retention/deletion also limits
availability; this is not an off-account archive.

After reconnecting to the same CloudShell home, the same verified operator can
print its newest saved attempt without any AWS call:

```bash
python3 /path/to/verified/start-owner-recovery-session.py --show-last-result
```

Use the actual verified operator path printed by its setup; the placeholder above
is documentation, not a ready owner command. The newest incomplete attempt is
shown instead of falling back to an older success. Saved files are revalidated and
unknown fields are excluded when reprinting. They bind account/region/exact stack,
instance, package SHA, runner source/hash and backup ID. They remain **owner terminal
observations, not signed or independent attestations**, and never authorize
production reopening or mark Stage 33 passed.

Validation adds bounded parsing, stale/conflicting outcomes, interruption, atomic
private-file handling, symlink rejection, local reprint, and generated real-PTY
checks. The existing single generated CMS-to-Postgres CI positive run now passes
its actual final result through the recorder; no duplicate positive restore is
added. No real owner key, backup or AWS SSM session is used for these tests.

Expiry, reset, page exit and challenge edits clear the client inputs/output;
asynchronous results are discarded after invalidation. Browser/OS copies cannot
be guaranteed physically erased. Close the page after use. The server closes
the one-use handoff on success or failure. SIGTERM follows Python cleanup.

## Evidence interpretation

`OWNER_SNAPSHOT_RESTORED_TO_ISOLATED_DATABASE` and
`actualBackupRestoredToIsolatedDatabase=true` require a successful real package
restore. Snapshot age at drill start and elapsed handoff/restore duration are
observations, not an agreed RPO/RTO service guarantee. The latter includes owner
handoff time and excludes infrastructure provisioning. Production reopening,
post-snapshot deletion/consent reconciliation and external secret rotation are
separate decisions. `productionRestoreVerified`, `reopenAuthorized` and
`realRecoveryReady` stay false.

The existing CI positive restore now passes through the new session/framing
controller, rather than adding another identical positive restore. Its inputs
are generated synthetic material. Owner-session boundary tests also cover
ambiguous/oversized PEM, invalid frames, deadlines, closure on input failure,
offline defaults, bounded commands and exact CSP hashes. This is technical
validation, not an independent human security or legal review.

After recording the actual owner result, delete and verify only the already
approved temporary stack and its attached resources. A timer listing alone does
not prove termination or cleanup. This change has not executed any AWS action.
