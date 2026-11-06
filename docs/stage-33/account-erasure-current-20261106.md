# Account erasure compatibility with the current ORZELL application

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

Processing and final erasure flags remain false by default. This is a review
candidate, not a live migration, service release, TestFlight upload or actual
account deletion. Before delivery, review business/history field treatment and
retention, actual queue responsibility/deadline, and independent review. Migrations
must precede the API and worker rollout; existing database backups are pinned to
the delivered application's image and require review when that image changes.

On 6 November the owner confirmed **only a phone is currently available**.
Independent production recovery remains blocked on a protected separate recovery
environment; no private recovery key is moved to CI or the live host. Personal
alarm delivery and real-device/photo-quality acceptance are also still open.
Stage 33 remains **NOT PASS**.
