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

The previous catalog queue and request are preserved under infra/operations.
Its existing tests now read those stable files, retaining every original
assertion while the current execution queue advances to this new operation.

## Bounded preparation retry

Operations run 40854564408 / SSM ede37ad1-91ee-4eff-a2aa-a28684bb5bcc
ended Failed at 10:08 UTC with the command timeout guard. The elapsed time points
to the full offline Nest build's 240-second limit; the helper suppressed private
command output. This is not a successful publication.

The retry requires the first work directory to contain only the four expected
preparation directories, exact original pinned source files and no result record,
compiled modules or copied live baseline. It also requires the old compiler to
be absent and the original catalog-corrected API image to remain healthy. Any
other state stops the retry for review. The original directory is preserved.

Preparation now emits only the two already typechecked isolated modules using a TypeScript program with resolved decorator types and
the existing compiler and reviewed configuration. CI compares both outputs to a
full Nest build of the exact reviewed application. Live preparation independently
requires the original emitted modules to match current API bytes before building
or publishing the candidate. Network isolation, immutable inputs, authentication,
image-only Compose delta, rollback, quotas, keys and unrelated-service guards
remain. Each isolated emission has a 90-second timeout and 640 MB memory limit.
A separate retry work directory retains no-replay behavior. No paid AI request
or database write is part of this operation.
