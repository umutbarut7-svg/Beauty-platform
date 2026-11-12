# Owner-operated isolated recovery session

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
