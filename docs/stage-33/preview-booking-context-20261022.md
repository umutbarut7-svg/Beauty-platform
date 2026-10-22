# Explicit customer booking context — preview correction

Status: prepared; candidate regression/build run [39794044679](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39794044679) is queued. No publication is claimed.

The customer UI omits customerId when reserving a slot. The appointments API
classifies an account with salon-owner membership as a managing actor regardless
of which UI mode is selected. In that context it requires an explicit customerId,
so the owner's attempt from the customer screen is rejected before any booking
is created. Refreshing the booking list clears the UI notice, hiding the previous
failure while still showing an empty list.

The pinned preview overlay adds optional boolean bookForSelf to the booking DTO
and sends true only from the customer reservation UI. When true, customerId
comes from the authenticated account's existing customer profile, including for
owners. A conflicting customerId is denied; internal business notes are ignored.
The existing manager flow without this flag still requires explicit customer
selection. Existing staff restrictions and ordinary customer ownership checks
remain unchanged.

The overlay applies to application commit
123e7339e2ab2a9e8e94f391a8431b73afc28efe and preserves the previously deployed auth
UX overlay. It adds seven focused regression cases to the existing appointment
test suite. API production compilation, mobile type checking and Expo export
must pass before candidate images can be packaged. It does not modify main's
older application source or silently replace the deployed release with main.

Prepared HTTP acceptance uses a private synthetic business and generated
@example.test identities. It checks actual owner self-booking, appearance in the
customer booking list, string-flag validation, customer spoofing rejection,
same-slot conflict and cross-customer read denial. The test appointment is
cancelled, the synthetic business is deactivated without publication, and its
sessions are logged out. Synthetic audit records are retained. Real salon
records are not used for write tests.

Publication is limited to API and gateway with fixed prior-image guards and
rollback. Worker, PostgreSQL, secret helper and admin are left running. The
enabled core flag is retained; AI/photo/policy flags remain closed. No automatic
payment or owner credential operation is part of this correction.
