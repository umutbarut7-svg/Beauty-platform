# Account deletion request intake

This change implements request creation and tracking, not completed account erasure or App Store acceptance. It does not change the live API, apply a production migration, or replace TestFlight build 1031.

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

No endpoint in this change marks a request COMPLETED. No operator can manufacture a completion result through the new API. It is not an excuse to mark the full account-deletion release gate PASS.

## Validation

Targeted unit tests cover wrong password, nonexistent owner, owner-only storage, no password projection and read-only status. HTTP/PostgreSQL integration covers authentication, body subject injection, concurrent request idempotency, cross-user isolation, admin-only queue access and preservation of business membership/account access. The isolated UI contract covers confirmation, cancellation without a request, clearing password state and truthful request receipt.

These are automated checks for the newly changed code. Previously user-confirmed booking and cancellation steps are not reopened or requested again.
