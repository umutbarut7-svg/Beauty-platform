# ORZELL admin entry — 11 November 2026

The preview API readiness endpoint returned HTTP 200 and the admin root rendered
its existing sign-in form. The same admin host returned HTTP 404 for `/login`.
This is a missing page route, not evidence that authentication or the API is down.

The change starts from delivered application `9c487dc425d157a2a5bb1de9bc48beab63eda90c`.
`/login` now exports the same page as `/`, retaining its SUPER_ADMIN restriction,
memory-only tokens, server authorization and 401 cleanup. The title and header
use ORZELL. The exact original mobile JPEG is reused (SHA256
`16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4`);
the same CSS viewport shows the original O/Z emblem followed by RZELL. No logo
redesign or image regeneration occurred. The stylesheet follows system light
(cream, champagne, beige, soft brown) and dark (black, purple, lavender) appearance.

Local checks: pinned pnpm 10.28.1 install without lockfile changes, shared types
build, Next.js production webpack build including both routes, admin unit test,
admin/script lint, admin typecheck and whitespace check passed. Local browser
installation returned incomplete archives; system Chromium failed at socket()
with Operation not permitted. Neither failure is a successful browser test.
The dedicated read-only PR workflow runs Chromium and WebKit against the built
Next.js application at 320/390/1024px in both themes. It intercepts every external
request, denies non-admin login, exercises a synthetic admin business/finance
session, then checks 401 removal of the selected business and empty browser
storage. The workflow uses no cloud credentials or real accounts.

## Independently closed AWS blocker

Only the failed read-only job was retried after the owner's Pricing permission
change: run [42304959175](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/42304959175),
job 130591237857, 11 November 2026 17:40:12 Istanbul. OIDC role assumption and the
actual Stockholm Pricing GetProducts request succeeded. Status:
SAME_ACCOUNT_SYNTHETIC_HOST_PLAN_PRICED. The old role/trust failure hypothesis
must not be treated as an ongoing confirmed blocker or prompt another IAM change.

That existing workflow still plans t3.medium, with current public AMI
ami-048b77d5ca32f6d32 and estimated USD 0.101044 for two hours excluding tax/data
transfer. It is not the previously prepared t3.small owner command and does not
supersede its Free Tier eligibility requirement. Output explicitly retains
provisioned=false, terminationVerified=false, realRecoveryReady=false,
privateKeyRead=false and productionDataRead=false. No resource was created.

## Open acceptance boundaries

This source change does not publish an admin container or a new TestFlight build.
Deployment and live `/login` acceptance remain open until separately verified.
Actual production restore, measured recovery time and temporary host cleanup,
physical iPhone 1151/Android acceptance, real-photo recommendation quality and
operated account-erasure decisions are still separate work. B2B quote requests
already have isolated browser/API checks; an empty live list is not proof of a
real business exchange or an implemented order/payment settlement flow.
Stage 33 remains NOT PASS. Completed booking and notification-delivery tests
must not be repeated merely because this page route was added.

## CI browser runtime repair

The first admin job 130596169855 was cancelled at its ten-minute deadline before
browser execution. The log shows repeated ignored package downloads from
`http://azure.archive.ubuntu.com/ubuntu`, not a failed application assertion.
An initial HTTPS mirror preparation passed its local boundaries and the real
HTTPS package endpoint returned HTTP 206 with a valid Debian archive header,
but browser setup still stalled on the GitHub runner. It is not a passed gate.

The final admin/application review jobs use the official Playwright 1.64.1 Noble
image, pinned to registry digest
`sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f`.
The OCI index returned HTTP 200 and its exact bytes match Docker-Content-Digest.
It supplies both browsers and their system dependencies; no apt/browser download
or certificate/signature bypass runs in these jobs. A package-version assertion
requires reviewing the pinned image when Playwright changes. This follows
https://playwright.dev/docs/docker .

The database/service regression job stays on its existing host and uses the
runner's installed Google Chrome via Playwright's supported chrome channel,
verified before integration tests. Local/default runs retain bundled Chromium.
All browser/application assertions and database/service setup remain unchanged.
The temporary mirror-rewrite helpers were removed from the final source.
