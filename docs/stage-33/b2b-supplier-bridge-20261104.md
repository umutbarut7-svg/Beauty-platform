# B2B supplier and business bridge

This builds on the shared product inventory (PR #87), following the owner's instruction to validate reusable flows instead of each service/product record. No real supplier, quote, catalog record or external message is created while developing or testing.

## Delivered code

Management roles can publish a self-declared BRAND/MANUFACTURER/DISTRIBUTOR/WHOLESALER profile on an active/public business. Existing business verification remains separate; declaring a company type does not verify it. Directory reads require a business management membership. Supplier listings exclude the buyer's own business.

Products use an explicit `b2bAvailable` opt-in separate from consumer `isPublic`. Only active products of listed active/public suppliers are visible. B2B product projections omit exact stock, thresholds, actors and operation keys. This is a quote workflow: a catalog price is not a confirmed wholesale price, order or reservation.

Buyers submit positive exact unit/ml/g quote quantities. The product name/SKU/unit is snapshotted, and product/supplier foreign keys include business identity. A serializable unique buyer/key receipt returns the original request ID on exact retry and rejects changed input/actor reuse. Supplier delisting blocks new requests but does not hide a party's existing history or invalidate exact retry of an already committed request.

Supplier managers can quote an explicit unit price/currency or decline only REQUESTED quotes. Buyer managers can cancel REQUESTED/QUOTED requests. Revisions prevent stale transitions and price overwrites; terminal requests cannot be reopened. Quotes do not decrement stock, place an order, charge money or send email/SMS. Contact and trading features beyond the in-app quote record remain separate work.

The business UI provides supplier search, product selection, request retry, outgoing/incoming history, supplier reply, buyer cancellation and explicit profile save. Changing supplier search clears the old recipient/product draft. Profile visibility toggles are draft values until Save. The product inventory screen controls B2B product opt-in. Optional inventory edit fields now reject null rather than forwarding invalid null mutations to Prisma.

## Validation and rollout

Local API/integration/mobile typechecks, lint/format and six shared inventory/B2B/parser gate tests passed. Real HTTP/PostgreSQL cases cover directory/product privacy, actor/tenant/side isolation, concurrent request deduplication, snapshot preservation, exact quantities, optimistic replies/cancellation, delisting and zero stock movement. Intercepted Chromium/WebKit acceptance covers one complete reusable buyer/supplier/profile journey and response-loss retry; no item-by-item acceptance is needed. Full CI and visual inspection are pending at creation.

`MVP_B2B_ENABLED` defaults false and requires inventory rollout too. Both the inventory migration and `20261104010000_b2b_supplier_bridge` must precede activation. API, clients and worker schema generation need coordinated delivery. The prepared inventory images from PR #88 predate this B2B source and cannot deploy it. Rebuild and pin a new package for the combined release.

No live migration, feature activation, paid AI request, TestFlight binary or store submission occurs in this preparation. Full commerce, supplier onboarding verification, purchase orders, payment/tax/shipping, stock reservation and remaining Stage 33 acceptance are not claimed.
