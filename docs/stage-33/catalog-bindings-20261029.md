# Preview catalog branch bindings

The owner-approved static inspection in run 40772209105 confirmed that the deployed
MvpService.catalog omits staff.locations. The source application at
381ee2a8d095041edd72cd06b3cab170422f990f already includes that projection.
The missing field makes the older iPhone client offer professionals at an
unassigned branch; authoritative availability correctly rejects that combination.
Earlier read-only diagnosis established that the selected branch and the
professional's assigned branch differ. Do not invent a new staff assignment.

## Prepared server correction

infra/operations/publish-preview-catalog-bindings.sh prepares a derivative of the
exact existing API image. It requires the inspected compiled method to match in
full, then adds only locations.select.locationId to its staff projection.
The running module must also match the original image byte for byte.
No broader application image upgrade or database migration is needed.

The operation runs the actual patched module in an isolated container with no
network. It verifies generated Prisma relation fields, the projection and existing
public-business, staff, service and feature guards. An offline regression proves
that the old method fails the same contract and the corrected method passes.

Publication preserves the API service's original independent Compose inputs,
requires its configuration hash to match, and permits only the API image to
change. Feature flags, model, request limits, process configuration and host
configuration must remain equal. Worker, database, gateway, admin and secret helper
identities and process lifetimes are checked. Failure after any attempted API
recreation restores the original image and verifies health. An operation record
retains rollback inputs and prevents unsafe replay.

No paid model request, photo submission, record write, booking, migration, key
creation or permission change is started by this operation. Module validation and
health/CORS acceptance do not establish authenticated live catalog-response or
physical-iPhone acceptance; those remain separate checks after publication.

## Application and device evidence

Candidate 381ee2a8d095041edd72cd06b3cab170422f990f passed Stage 32 validation
40770185836, application review 40770185939, Android/iOS compilation 40770185754
and native photo runtime 40770185778. The final native probe used iPhone 16e with
iOS 26.2 and passed native reads, JPEG normalization, authorized Expo multipart
HTTP upload, source metadata removal, temporary-file cleanup and source retention.
Its report has no server errors. This simulator result does not replace a physical
device test.

The prepared server operation has 18 offline tests, including failure recovery,
replay prevention, Compose/image/environment drift, writable-layer drift, offline
build isolation, and rejection of the old catalog projection. They passed locally.
The real host candidate build and post-publication checks have not run.

## Approval boundary

PR #58 is ready for review but unmerged. Automatic approval review rejected its
merge on 29 October because explicit approval is required for that shared-branch
mutation. No alternate merge route was used. This proposal prepares the remaining
server change and must not be merged or executed until approval covers that
server update too.

The execution queue downloads the helper only from an immutable repository commit,
verifies its SHA-256 digest and bounds its size before running it. The normal
preview operations workflow remains restricted to main and the existing instance.

The approval should explicitly cover merging #58 into #54's branch, merging the
combined application into the existing internal TestFlight branch, distributing
the resulting internal test build, and merging/executing this separate preview
server correction. Public App Store release and additional paid AI requests are
outside that proposal. Stage 33 remains open.
