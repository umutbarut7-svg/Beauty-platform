# Appointment material consumption

Continues from the combined service-card, inventory and B2B release source
`b19fa158ce5272b65cd6d634477275ebc395be54`. Signed upload 41905888208
completed; Apple/internal-group verification 41907326713 confirmed ORZELL
1.0.0 (1141) as VALID / IN_BETA_TESTING at 23:33 Istanbul, 4 November.
Physical installation is not inferred from Apple acceptance.

## Behavior

A manager opens a completed appointment, reads its current material receipt,
selects 1–50 active products with actual quantities, previews the complete list,
and explicitly confirms one stock deduction. No deduction occurs on booking,
status change, result submission, preview, navigation or receipt reading.
Each appointment has one immutable consumption batch. Corrections use the
existing explicit, reasoned product movement workflow and do not rewrite it.
Recipes, automatic consumption estimates, cost/margin calculations and product
sales/payments are not introduced.

The existing database restriction to IMPORT/MOVEMENT operation types stays intact.
Parent and child receipts use MOVEMENT with explicit APPOINTMENT_CONSUMPTION
and APPOINTMENT_MATERIAL JSON kind tags; no new database type is required.

The API verifies current inventory management membership and appointment tenant
inside the serializable transaction. Non-completed appointments, inactive or
foreign products, duplicate product IDs, fractional UNIT amounts, non-positive
amounts and insufficient stock reject the entire batch. Exact Decimal quantities
and existing optimistic revisions prevent negative stock and lost updates.

Existing InventoryOperation and InventoryMovement tables are reused. A permanent,
server-derived, NUL-separated appointment key is inaccessible to validated manual
movement keys. A parent operation stores the appointment/service snapshot and
all item receipts. Each line retains the existing one-operation/one-movement
relation through a child operation. All parent/child receipts and stock changes
commit atomically; identical canonical retries read the stored receipt, changed
input conflicts, and retries across sessions cannot deduct twice. These
appointment links are application-validated receipt snapshots, not new database
foreign keys. No schema/retention/model/provider/credential/quota change occurs.

Management-only product history projects the appointment reference and stored
service label for material deductions. Customer/public/B2B product projections
do not gain receipt, actor, appointment or exact private stock fields.

The phone form requires a successful receipt read before editing. Appointment
navigation resets its draft. A write with an uncertain outcome freezes and
preserves the submitted list, offering only a receipt check or the same request.
A definitive rejection allows editing only after a successful receipt read.
An older server without this endpoint cannot expose the write form.

## Validation and delivery status

Shared HTTP/PostgreSQL coverage exercises permissions, appointment state, whole
batch validation/rollback, canonical concurrent retry, immutable private receipt,
cross-appointment stock competition, and the 50-line boundary. Isolated Chromium
and WebKit coverage uses two representative products together and checks draft
isolation, failed reads, exact measured amounts, explicit preview/confirmation,
ambiguous-response retry, receipt reopening and narrow-screen overflow. Every
external request is intercepted; fixtures are synthetic.

Local and CI results are recorded with the reviewed candidate in the PR and
persistent work log. This document alone does not assert passed checks or live
deployment. Build 1141 does not contain this new consumption flow. No real
appointment/material record or paid AI operation is created. Existing successful
booking/cancellation/result-reading tests are retained. Stage 33 remains NOT PASS
while physical-device/product/privacy/production recovery acceptance is open.
