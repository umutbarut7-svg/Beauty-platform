# Shared product catalog and inventory

One reusable product workflow supports arbitrary product names/SKUs. The owner requested that adding more services/products must not repeat individual acceptance tests. Validation is by shared behavior and representative batches, not a separate run for each item. Existing booking and AI acceptance is retained.

## Behavior

- Management roles (owner/admin/manager/platform admin) can import 1–50 products atomically, edit metadata with revision checks, record stock IN/OUT and read the last 100 movements. Staff/customers cannot read internal inventory.
- The paste preview accepts seven tab-separated columns: SKU, name, brand, price, ISO currency, unit (UNIT/ML/G), low-stock threshold. Prices accept comma decimals without thousands separators. New products start private with zero stock. Initial stock is an explicit movement, never fabricated.
- SKU is immutable and unique within the business, normalized to uppercase. A conflicting row rolls back the batch. Quantities use exact PostgreSQL/Prisma decimals; UNIT quantities/thresholds must be integers. Stock cannot be negative or exceed its numeric bound.
- Serializable operation receipts commit with imports/stock changes. Same-key/same-payload retries replay the receipt, and changed-payload reuse conflicts. Unique/serialization races retry boundedly. Client keys survive failed requests within the mounted screen; successful acknowledged actions retire their keys so a later identical intentional movement can execute. Keys are not persisted across app restarts; operators must inspect movement history before manually repeating an uncertain action after restart.
- Product and operation foreign keys include business identity. Database constraints enforce nonnegative stock/prices/thresholds and positive movement quantities. There is no hard-delete endpoint. Inventory/history business deletion is restricted pending reviewed retention rules; no universal erasure claim.
- Customer catalog exposes only active/public products of an active/public business. It returns availability, never exact stock, thresholds, operation receipts or actor references. No ordering/payment or automatic service consumption is implemented.
- Lists paginate in 50-row pages. Movement history is explicitly the latest 100 rows. Units/SKUs cannot be silently changed. Product prices do not modify services or appointments.

## Delivery boundary

`MVP_INVENTORY_ENABLED` defaults false and must stay closed until migration `20261104000000_product_inventory` and the corresponding API/client are deployed. Old catalog responses omit the capability; new clients hide customer product browsing unless the server advertises it. The dedicated management screen reports the existing unavailable response when the backend is closed. No current live catalog data, provider key, AI quota, retention or published binary changes during preparation.

Shared local typechecks/lint and batch/permission/closed-gate tests passed. Added real HTTP/PostgreSQL cases for concurrent import replay, atomic rejection, tenant/role isolation, stock race/overselling, exact measured quantities, stale edits, DB negative-stock rejection, publication/privacy and pagination. Fully intercepted Chromium/WebKit acceptance covers a representative batch, response-loss retries, new-intent keys after acknowledgement, stock limits, editing, visibility and customer display. CI results are pending at creation.

Product/stock code is distinct from live rollout. B2B supplier bridge, purchase orders, payments, service material consumption and full Stage 33 acceptance remain open.
