# Preview consultation recovery publication

Companion PR #60 adds an explicit read-only route back to an existing active
consultation. This proposal prepares the separate preview API update. It is not a
photo/analysis/matching test and starts no paid request.

The operation requires the completed catalog correction's original image lineage
and unchanged catalog-module digest. The existing API's independent Compose inputs
and configuration hash must match. All feature flags, request limits, bootstrap,
process settings and unrelated services remain equal.

Only the two reviewed visual service/controller TypeScript files are downloaded
from immutable commits with pinned Git blob digests and bounded response sizes.
The old files match the original reviewed application source. Both old and new
versions compile in the existing compiler image with networking disabled. The old
compiled modules must match the current API byte for byte before packaging.

The candidate inherits the current API image and copies only those two compiled
modules. A separate container with networking disabled checks the real list/route
implementation using synthetic data, including owner/expiry/policy/projection and
the no-store header. No real database, credentials or model provider is available
to that probe.

The operation allows only the API image to change. It verifies both deployed
module digests, HTTPS health/CORS and an unauthenticated 401 on the new private
route. These checks do not establish owner-authenticated live consultation or
physical-device quality acceptance. Failure after any attempted API recreation
restores the prior image and checks health and unrelated-service identities.

A preparation deadline reserves the remaining operation window for acceptance
and rollback. The result record retains rollback inputs and prevents replay of
an incomplete operation. The bridge's 900-second SSM limit remains unchanged.
No migration, record write, worker/gateway update, key change, paid AI request or
public App Store release is part of this proposal.

Source/application validation and phone acceptance are tracked in PR #60. This
control-plane proposal must pass its own safety/general CI before execution.
