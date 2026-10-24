# Offline photo recovery with conservative invalidation

A backup taken before a consent withdrawal still contains an apparently active
consent and its old plan. The database cannot infer events that happened after
that snapshot. Keep the recovered system offline until reconciliation completes.

`infra/operations/quarantine-restored-photos.sql` is the conservative fallback
when a complete, independently durable withdrawal journal is unavailable. It
invalidates **all** restored photo consents, including consents that were still
valid. It scrubs analysis output, intent, target and answers, marks photos for
normal worker erasure, and records `photo.restore.invalidated` rather than falsely
claiming that a user withdrew consent. It preserves accounts, audit expiration
and existing withdrawal times. Repeating it does not duplicate invalidation
events or extend retention. It does not delete cloud objects itself.

## Recovery procedure

1. Restore into a separate isolated database and private storage namespace.
   Keep public API routes, object access, background AI and uploads stopped.
   Changing feature flags alone does not establish this isolation. Existing
   presigned URLs and shared object namespaces need a separate storage review.
2. Verify the target database, application/schema revision and private storage
   configuration. Review the impact: every restored consultation will become
   unavailable, including previously valid ones. Retain only authorized,
   encrypted recovery material under the applicable retention policy.
3. In a single `psql -X -v ON_ERROR_STOP=1` session, set
   `orzell.restore_quarantine` to `confirmed-offline` and
   `orzell.restore_database` to the exact `current_database()` name, then execute
   the SQL file. These two acknowledgements prevent accidental execution; they
   are not evidence that the environment is actually offline.
4. Require successful commit. Check that no photo consents or photos remain
   unrevoked and no analysis content remains. The operation is transactional;
   a failure means the recovery gate remains closed. Run it again to verify
   idempotency before allowing any access.
5. Run the real privacy cleanup worker against the **restored isolated** storage
   until eligible photo objects are erased. Verify object absence, denied owner
   reads, preserved audit evidence and unchanged unrelated data. Complete the
   separate authentication/session recovery review before opening any routes.
6. Only after the recovery checks pass may the operator consider reopening the
   environment. Old photos/analyses remain unavailable. New consultation data
   requires a new explicit consent and upload under reviewed policy/provider
   settings; old consent must not be silently restored.

This is a prepared procedure, not authorization to invalidate production data.
No live restore, bulk invalidation or production storage deletion was performed.

## Automated acceptance

The `Privacy backup restore acceptance` workflow runs both snapshot boundaries
against application `3be316d1b2458c49fde162147244aa8077a1f614`:

- **AFTER_WITHDRAWAL_COMMIT:** existing withdrawal survives real pg_dump/restore;
  expired and withdrawn sessions are hidden/erased while valid content survives.
- **BEFORE_WITHDRAWAL_COMMIT:** the isolated query first demonstrates the missing
  withdrawal. The SQL refuses absent acknowledgement and wrong database name.
  Correctly acknowledged invalidation runs twice, blocks both owners, scrubs
  content and preserves audit expiration. Two real cleanup worker runs erase
  the eligible local fixture objects without duplicate erasure events.

The test uses disposable PostgreSQL and local synthetic files, no public API
listener or provider calls. CI results must be read separately; adding a workflow
is not a passing result. Encrypted production backups, S3 recovery, storage URL
isolation and durable withdrawal replay still require their own acceptance.
