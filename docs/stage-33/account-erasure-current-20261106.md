# Account erasure compatibility with the current ORZELL application

## 11 November compatibility update

The candidate now incorporates delivery commit
`61f97f0ed996844917be036a77e36d9aad999a94`, including `/login`, the original
ORZELL identity and both system themes, and shared exact minor-unit formatting.
The admin import conflict was resolved by preserving both `AccountDeletionQueue`
and `formatMinorUnits`. No deletion-service, schema or mobile-photo behavior was
changed by this update.

The admin browser review additionally checks that a non-admin cannot see the
operator queue, a signed-in admin can inspect a synthetic pending request and
its inventory blocker, and an expired queue request removes the queue, account
email and business selection. It performs no begin/finalize operation. All seven automated
validation groups completed successfully for application candidate
`6664e6fd4d2e793a13c011be212ae3d3fce95fa5`; exact run IDs and operational
boundaries are recorded in [the operator runbook](account-deletion-operations-20261111.md).
The runs were read and matched to this commit, not re-executed.

The 11 November admin-only live release contains the delivery source above;
it does not include this draft or enable account erasure. Earlier personal
backup-alert delivery was accepted and does not need repeating. Read-only
recovery inspection on 11 November found no active narrowly tagged rehearsal
host or current recovery stack; this is not a production restore or complete
residual-resource cleanup proof. The owner designated Umut Barut as the daily queue operator on 11 November.
This does not grant a SUPER_ADMIN role or establish live queue access.
Production recovery, a published deadline, business-history treatment and
independent review remain open. Processing and erasure flags stay disabled.

## Candidate scope

The original account-erasure candidate PR47 (`6ea4503a7c152ed6a257d2d2c01275fdd0c58a54`)
predates saved matching, product inventory, B2B and appointment material consumption.
This candidate integrates it with TestFlight delivery source
`9c487dc` (application `2e56def282c97a804a2f3d6c9b36a53b42a09df5`, delivered as 1151).
It preserves the current booking, consultation, product and supplier flows.

Beginning deletion processing now clears saved matching status, request identity
and output in the same transaction as consultation revocation. The offline photo
quarantine also clears all three matching fields immediately, including an
already-REVOKED row. Late analysis responses cannot repopulate the revoked record.
Photo object keys remain available to cleanup until physical absence is verified.

Schema-derived account inspection includes the current `InventoryOperation` and
`B2BQuoteRequest` models. Actor, requester and responder identity references block
erasure until their business-record treatment is actually reviewed. The candidate
does not introduce a deletion or indefinite-retention policy for these records.

## Validation scope

- Keep both branches' assertions when resolving the four merge conflicts: current
  consultation recovery, inventory/B2B schema, booking options and result UI tests,
  alongside account request, receipt and operator queue assertions.
- Extend the real PostgreSQL/S3-compatible deletion scenario to seed saved matches
  and verify their immediate removal before worker cleanup or a late response.
- Exercise actual PostgreSQL inventory/B2B loose identity blockers; rejected
  finalization must preserve the account, operation, quote and product exactly.
- Extend both real pg_dump/pg_restore fixture boundaries with saved matching data;
  verify acknowledged offline quarantine immediately rather than relying on a sweep.
- Upgrade a disposable database from the exact 1151 migration history to this
  candidate and compare the complete synthetic account, saved-match, inventory and
  B2B rows. A schema upgrade must not itself erase or quarantine any account.
- Run the existing API/HTTP, web, worker crash/retry, restore and unsigned native
  compilation checks against this candidate. Older PR47 results are historical
  evidence, not successful runs of this integration.

## Delivery gates remain open

The replacement-owner guard also excludes restored/quarantined accounts. A
membership whose account cannot authenticate must not allow the last available
owner to enter deletion processing. The real HTTP/PostgreSQL ownership scenario
checks rejection without changing the requesting owner's sessions, request or
business memberships, then retains the existing concurrent-owner test once the
replacement is available again.

Processing and final erasure flags remain false by default. This is a review
candidate, not a live migration, service release, TestFlight upload or actual
account deletion. Before delivery, review business/history field treatment and
retention, verified operator access and a published deadline, and independent review. Migrations
must precede the API and worker rollout; existing database backups are pinned to
the delivered application's image and require review when that image changes.

On 6 November the owner confirmed **only a phone is currently available**.
Independent production recovery remains blocked on a protected separate recovery
environment; no private recovery key is moved to CI or the live host. Real-device/photo-quality acceptance is also still open. The historical
alarm-delivery gap was closed later; see the dated update above.
Stage 33 remains **NOT PASS**.
