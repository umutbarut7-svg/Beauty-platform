# Account deletion intake and processing boundary

This change implements request intake, processing authorization and photo withdrawal/cleanup handoff, not completed account erasure or App Store acceptance. It does not change the live API, apply a production migration, or replace TestFlight build 1031.

## Implemented

- The account screen opens a confirmation form only after an authenticated status read succeeds.
- The user supplies their current password and the exact confirmation HESABIMI SIL. Cancelling the form creates no request and clears both fields.
- POST /auth/account-deletion takes identity exclusively from the authenticated user. Incorrect passwords return 403 so the existing client does not confuse password verification with an expired session and log the user out.
- A unique owner key and conflict-safe createMany(skipDuplicates) insert make concurrent retries one request. An empty-update upsert was rejected after the real concurrent HTTP test exposed a read/create race. No plaintext password, email, user-provided subject ID or tenant ID is stored in the request table.
- GET /auth/account-deletion returns only that owner's receipt. GET /auth/account-deletion/pending is restricted to SUPER_ADMIN and paginates pending receipts with the minimum operator identity fields.
- Receipt and UI explicitly state that deletion is not completed. The account remains usable. This avoids turning a request, logout or account deactivation into a false deletion result.
- The additive migration creates one table, one unique owner constraint and one owner foreign key. It deletes no existing record.

## Remaining completion gate

This is the first part of the existing account-deletion work item. The complete item remains OPEN. Before enabling this intake in a public release, implement and validate:

1. A disclosed processing deadline and an operated queue with actual completion notification.
2. Handling of sole business owners, membership revocation and transfer without deleting other people's tenant records.
3. A reviewed retention scope for booking, financial, audit and business records; required retention must not become retention of every personal record by default.
4. Revocation of all refresh sessions and outstanding access-token authorization at the correct deletion boundary. Logout alone is insufficient.
5. Withdrawal, consultation scrubbing, actual private-object erasure and retry after storage failure before database cascade can lose the object cleanup keys.
6. Verified erasure/anonymization of account-associated content, completion evidence and the restoration/withdrawal boundary in production backups.

## Processing boundary (26 October 2026)

The next implementation adds a non-erasing processing boundary. `POST /auth/account-deletion/:requestId/begin` requires the current database role SUPER_ADMIN, an exact `ISLEME AL` confirmation and `ACCOUNT_DELETION_PROCESSING_ENABLED=true`. This flag is false by default and must stay false until an operated processing queue, deadline and notification procedure exist. Request intake still preserves account access until an operator begins processing. There is no automatic freeze worker.

A serializable transaction checks ownership, sets `processingAt`, and revokes all existing refresh sessions together. A security event records the operator and request IDs in that same transaction; retries do not duplicate the event. A sole business owner must transfer ownership first. An alternative owner whose own deletion is already processing does not count. Concurrent freezes of two owners serialize and retry conflicts, so at least one available owner remains. SUPER_ADMIN subjects require separate review and cannot be frozen by this endpoint. Retrying a started request preserves its original timestamp.

Every protected HTTP request now loads the account's current database identity and role. Deleted accounts and accounts with a processing deletion request are rejected, including previously signed access tokens. Login and refresh also reject processing accounts. This prevents an old administrator token from retaining a downgraded role. Public endpoints retain their existing behavior. A request-only receipt has no effect on authorization. Authorization is checked at request entry; quiescing already-running work remains part of the future erasure processor. No cancellation/unfreeze endpoint exists.

`PROCESSING` explicitly keeps `deletionCompleted=false`. The account, business memberships, remaining personal records and private-photo cleanup keys remain stored; consultation text is scrubbed and photo access withdrawn, but freezing is neither erasure nor anonymization. This additive migration only adds one nullable timestamp. No live migration, queue enablement, account freeze, TestFlight upload or store submission is part of this implementation.

The outstanding gate still includes notification/deadline, retention review, per-record erasure/anonymization, membership removal, private-object retries and backup restoration handling. The authorization boundary must be validated on the exact release revision before rollout.

No endpoint in this change marks a request COMPLETED. No operator can manufacture a completion result through the new API. It is not an excuse to mark the full account-deletion release gate PASS.

## Validation

Targeted unit tests cover wrong password, nonexistent owner, owner-only storage, no password projection and read-only status. HTTP/PostgreSQL integration covers authentication, body subject injection, concurrent request idempotency, cross-user isolation, admin-only queue access and preservation of business membership/account access. The isolated UI contract covers confirmation, cancellation without a request, clearing password state and truthful request receipt.

These are automated checks for the newly changed code. Previously user-confirmed booking and cancellation steps are not reopened or requested again.

### Processing validation

Local validation: all 452 API unit tests passed, including 18 auth/intake/processing tests; Prisma format/validate/generate, API and HTTP-integration typechecks, changed-file lint and whitespace checks passed. The added real HTTP/PostgreSQL test checks endpoint authorization/confirmation, sole-owner protection, concurrent two-owner freezes, idempotent receipts, existing access/refresh token rejection, login blocking, current-role enforcement and preservation of tenant records. CI 40401760043, UI 40401759991 and Android/iOS 40401760018 passed on 50cf2f4. The newer photo-cleanup continuation requires its own CI results in PR #47; these earlier results do not certify subsequent changes.

## Photo cleanup continuation

The deletion transaction now takes the same per-owner advisory lock as photo authorization, revokes all account photo consents/photos, clears consultation intent/target/answers/output, and records consent-withdrawal events with each original audit expiry. It does not delete rows or lose object keys. Delayed consent/upload/analysis writes recheck processing under the lock; delayed provider output cannot publish. If the final transactional audit fails, the account freeze, session revocation and photo withdrawal all roll back.

The existing maintenance worker keeps retryable tombstones. Physical erasure now requires an exact-object HeadObject 404 after DeleteObject. A present object, denied verification or storage timeout never produces deletedAt or a false erasure event. Cleanup continues with customer photo policy flags closed. The account receipt stays PROCESSING/deletionCompleted=false even after photos are physically erased. Full account anonymization/retention, deadline/notification and restore boundaries remain open; see current-status.md.
