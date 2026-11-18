# ORZELL Everywhere authenticated web booking

This is the next delivery slice on top of PR #149's exact source
`785b07e022de56d3c9125065ecfe89409626958d`. It leaves that PR's ongoing checks
untouched. Original App.tsx, O/Z artwork, finance, CRM, inventory and B2B source
are retained. There is no migration or new dependency.

## Customer flow

A visitor reads the published service without signing in. Web booking, when
separately enabled, offers the existing customer login/registration flow and then
explicit location, specialist, day and available-slot choices. The specialist
bound by a share URL cannot silently change. The final action shows the current
staff price, currency, duration and time before submitting a self-booking.

Only a validated persisted PENDING receipt produces "İşletme onayı bekleniyor".
It is not represented as a confirmed appointment. The customer can inspect their
own receipts and explicitly cancel, subject to the existing cancellation policy.
Logging out or receiving a 401 clears quotes and receipts; credentials/tokens are
not placed in URLs, cookies, localStorage or sessionStorage.

## Backend boundaries

- Public discovery now additionally projects active location IDs/names. No
  address, staff contact, customer or private result/photo data is added.
- Quote, create, own-list and own-cancel endpoints are authenticated. They are
  closed unless both `ORZELL_EVERYWHERE_ENABLED` and
  `ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED` equal `true`.
- Quote resolution uses the existing AvailabilityService with the verified
  staff-profile ID and active business/service/location relationships.
- Booking delegates to the existing AppointmentsService with `bookForSelf=true`.
  An optional internal callback rechecks publication, staff assignment, location,
  quoted price/currency/duration inside the same serializable transaction and
  staff lock. It runs before any write. Existing callers do not provide the
  callback and keep their previous behavior. Category, availability, overlap and
  booking-policy checks remain in the existing service.
- Prices are compared as integer hundredths using BigInt. Changing price,
  currency, duration or slot never silently accepts the old quote.
- Concurrent attempts are bounded by the existing booking lock and PostgreSQL
  overlap constraint. The client makes one write attempt and does not retry an
  ambiguous network result. "Randevularımı kontrol et" reads persisted own records
  before the customer decides what to do next. This is not a new idempotency-key
  or payment/refund subsystem.
- The own-booking projection is customer-scoped even for a business owner.
  Other users cannot inspect or cancel it. Existing own receipts and cancellation
  remain accessible after the business withdraws public discovery, while the
  feature remains enabled. Cancellation settings/windows remain enforced.

## Runtime routing

The approved API origin remains a bare HTTPS origin. Optional
`ORZELL_PUBLIC_API_PATH_PREFIX=/api` supports the existing reverse-proxy mount;
only empty or `/api` is allowed. Other prefixes, credentials, query strings,
fragments and redirects are refused. The web page remains dynamically rendered.
The new booking flag defaults to false; no production configuration was changed.

## Validation

Local checks cover quote/receipt wire boundaries and exact decimal comparisons,
existing appointment unit tests, TypeScript for API/integration/admin, lint,
formatting and the production Next build. A generated local HTTPS CA verifies the
actual server-rendered page and `/api` prefix without disabling Node TLS checks.
The workspace's browser archive download was invalid; local browser acceptance is
not claimed. The pinned CI browser container runs the added Chromium/WebKit flow.

The new disposable PostgreSQL/HTTP suite covers authentication/whitelisting,
foreign tenant/staff/location, withdrawn publication, stale quote fields,
unavailable slots, concurrent requests with exactly one persisted PENDING row,
the business-side appointment list, own-record privacy and policy-controlled
cancellation. It is included in the existing Stage32 integration command.

The isolated browser scenario covers progressive sign-in, quote/submit/cancel,
changed-price rejection, a response lost after a synthetic write with no retry,
own-receipt reconciliation, foreign quote rejection and 401 cleanup. All requests
stay within its local Next server and generated HTTPS fixture. Its temporary CA
and key are synthetic and removed at the end.

## Remaining delivery gates

CI must validate this exact candidate, including real PostgreSQL and the browser
flow. These tests are generated fixtures, not real salon/customer/device proof.
Production rollout, TestFlight upload, actual iPhone/Android link acceptance,
verified-domain association and official social-provider authorizations remain
separate. Public portfolio/result images remain closed. QR, richer social cards,
consented attribution and other provider adapters remain open.

Existing 15 November backup recovery/temporary-stack cleanup and accepted device
observations are preserved. No recovery key, new paid resource, AI/provider call,
personal notification, live appointment or deletion was used. Stage33 overall
PASS is not declared by this change.
