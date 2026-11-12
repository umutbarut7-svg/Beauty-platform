# Offline recovery: business data integrity

The owner screenshot IMG_2636.png (12 November, screen time 21:18) reports
`ENCRYPTED_PACKAGE_AUTHENTICATED_NO_RESTORE` for `orzell-database-20261112`.
The encrypted package is 667576 bytes and its SHA256 matches the independently
recorded receipt. The signature, recipient, source and ciphertext context passed;
`encryptedPackageRead` and `sourceReferenceMatched` are true. This closes the
owner encrypted-package inspection step. It does not establish decryption,
production schema acceptance, a successful restore or real recovery readiness.
No owner key was read. Do not request that completed package check again.

## New controller boundary

The disposable restore controller now runs `recovery-domain-check.sql` before
access quarantine and again afterwards. The check executes in a read-only
PostgreSQL session and returns one boolean. A mismatch fails at the `DOMAIN`
stage and the existing cleanup path still removes the temporary database.
There is no new live intake, deployment, provider call, role or AWS resource.

The query targets the independently migrated source
`2e56def282c97a804a2f3d6c9b36a53b42a09df5`, including its existing JSON material
receipts. It checks these finite invariants:

- Product stock equals exact numeric net movements; measured and whole-unit
  quantities obey their units, and nonfinite numeric values are rejected.
- Movements and operation receipts agree on product, tenant, amount after the
  movement and unit. Import receipts reference products of their own business.
- Appointments retain their tenant-scoped service, customer profile, staff,
  membership and location references.
- Material parents bind a completed appointment, its service, permanent
  NUL-separated key hash and 1–50 distinct product lines. Every line agrees with
  exactly one child receipt and OUT movement; orphan children, foreign tenants,
  altered receipt links, amounts or keys fail.
- B2B quotes retain buyer/supplier/product/unit/SKU and actor references and
  quoted price/currency/response requirements. Historical labels/prices and
  later supplier/product unlisting are allowed. Current membership is not
  substituted for historical authorization.

The controller also compares full canonical snapshots of the business domain
tables before and after both quarantine applications, including operations,
movements, appointments and B2B receipts. These snapshots remain inside the
temporary tmpfs target; reports contain neither rows nor their fingerprints.
The catalog/schema fingerprint and independent source binding remain unchanged.

## Validation and limits

The credential-free CI fixture adds two businesses, measured and whole-unit
stock, a two-product material batch and a historical quote. Rollback probes
mutate balances, receipts, tenant links, item shape/cardinality, child keys,
quantities and B2B actors/nonfinite price. A valid-schema dump with inconsistent
stock must also fail inside a real offline PostgreSQL restore target, with
target removal verified. Positive signed CMS → sealed memory → restore →
quarantine coverage and the separate schema mismatch boundary are retained
because the controller changed. Actual CI results belong to the PR record.

This is not an exhaustive business/security audit, HTTP authorization proof,
comparison with today's production data, a complete temporal movement-chain
proof, post-backup erasure reconciliation, physical object cleanup, or permission
to reopen the application. A newer source/schema needs its own independent
reference. The physical iPhone path, protected owner key handoff, approved real
host, independent review, actual restore and RTO/RPO acceptance remain open.
Stage 33 remains **NOT PASS**.
