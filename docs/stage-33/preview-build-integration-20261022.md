# Preview build and integration evidence — 22 October 2026

The GitHub OIDC / SSM bridge successfully inspected the existing preview host
(run [39767597857](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39767597857), second attempt).

Admin image:
`sha256:fc18e8b3deffb8939f8dbd8735ecbc6bb769462138f7a65b9c377c0cc2814b4c`.
The preserved-context Webpack build exited 0, reused nine cached steps, and
completed compilation and image export (run
[39769506104](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39769506104)).
PR #19 persists the verified build command; Stage 32 CI on its head passed.

Gateway / Expo web image:
`sha256:05686cfe8cee185657590777e7b3b53a28adbd4fdee769095ff6dbb02242391f`.
Build exited 0 and exported the web application and image (run
[39780319616](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39780319616)).

Local integration run
[39780691270](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39780691270)
started temporary admin and gateway containers on the existing Docker network,
with the gateway published only to 127.0.0.1. Both frontend hosts returned HTML
and a JavaScript asset; both proxied API readiness successfully. Admin used about
43 MiB of its 256 MiB limit and gateway about 11 MiB of its 96 MiB limit. The
existing API stayed healthy; temporary frontend containers were removed.
Both temporary public DNS names resolved to the existing public IPv4.

Before activation, the API permitted only the placeholder origins https://preview.invalid and
https://admin.invalid. Public activation was explicitly approved and completed on 22 October 2026 (see the activation evidence below). The prepared
`infra/operations/activate-preview.py` defaults to a local plan, pins the reviewed
Compose blob and tested image IDs, and refuses existing frontend replacements or
unexpected API origins. Only after explicit owner approval may `--approved`
recreate API with the two matching origins and start admin/gateway on existing
ports 80/443. It checks trusted HTTPS, HTML, API readiness and CORS, and attempts
to restore prior API origins and remove only its new frontends on failure.
It does not run migrations, restart the database/worker, delete volumes, or
provision AWS capacity.

The pre-activation checks alone did not establish public TLS issuance or full browser interactions,
real-photo/native acceptance, production readiness, or completion of all Stage 33
requirements. The activation section below records the subsequently completed gates.

## Owner-approved public activation

Run [39781782391](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39781782391)
completed successfully. API was recreated with the two matching origins, then the
pinned admin and gateway images were started. Trusted HTTPS, HTML, API readiness
and matching Access-Control-Allow-Origin headers passed for both hostnames.
No schema migration, database/worker restart, volume deletion, or new AWS capacity
was part of this activation. Rollback was not needed.

A separate cloud browser opened both public addresses and displayed the Turkish
customer sign-in screen and the admin “Yönetim merkezi” sign-in screen. No
application-origin console errors were observed; the browser extension emitted
an unrelated metadata error. No credentials were entered and no user account was
created during this read-only browser check.

- Customer preview: https://preview.13-51-112-228.sslip.io/
- Operator sign-in: https://admin.13-51-112-228.sslip.io/

This supersedes the earlier pending-public-TLS note for this activation only.
Authenticated user journeys, independent operator authorization, native/real-photo
acceptance, restart/reboot acceptance and all remaining Stage 33 gates are still
not established by these checks. Production readiness is not claimed.

## Public authentication acceptance and user-reported signup correction

On 22 October, a user reported a generic error on signup/sign-in. The backend
requires a minimum of 12 password characters for registration, but the deployed
web UI did not show this rule. The screenshot alone does not establish the
user's password length or account state.

Live synthetic HTTP acceptance run
[39784234670](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39784234670)
passed registration (201), login (200), authenticated identity (200), duplicate
email rejection (409), wrong-password denial (401), short-password rejection
(400), refresh rotation and reuse denial, logout and revoked-refresh denial.
New users remain CUSTOMER. Credentials and tokens stayed in process memory and
were not emitted to public logs. Two isolated @example.test customer records were
created across the initial and corrected acceptance runs. They were retained
without elevated privileges; the completed run revoked its refresh sessions.
The initial run stopped at a closed MVP route before logout; its synthetic
sessions retain their normal expiry. No owner account was inspected or changed.

The first run
[39783862889](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39783862889)
incorrectly expected booking reads to be enabled. The deployed MVP rollout is
intentionally closed, so 503 is the correct result for booking/passport routes.
The corrected run confirms those gates and the unavailable photo capability.
These expected denials do not establish a working enabled booking journey.

The preview release remains based on application commit
123e7339e2ab2a9e8e94f391a8431b73afc28efe, with a narrow, source-pinned App.tsx
overlay in infra/operations/preview-auth-ux-overlay.py. Main contains older
application code and was not substituted for the deployed release.

The overlay adds the 12-character registration hint, validates email and short
registration passwords before sending a request, normalizes email, and provides
separate messages for invalid credentials, duplicate account, validation, and
rate limiting. Existing login passwords are not subject to a new local minimum.
Seven focused handler regression cases passed locally using Node 24; the reusable
test accepts the patched App.tsx path as its first argument.

The isolated 640 MiB / one-CPU build completed mobile TypeScript checking and an
Expo production web export. Packaging run
[39785849221](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39785849221)
verified the compiled Turkish copy and produced gateway image
sha256:12795b0505df58bd349a803b76887a2452b77ba15c919a95e541f0f1bee502df.
Earlier preparation attempts failed before publication because of build workspace
permissions, escaped text assertions, and local base-image resolution. They did
not alter the running gateway.

Gateway-only release run
[39786082654](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/39786082654)
passed isolated HTML/JS/copy/API-proxy acceptance, then public HTTPS, updated
JavaScript and both API proxies. The prior gateway image was retained for rollback;
rollback was unnecessary. API, worker, database, admin, and secret-helper start
times were unchanged. No migrations, AWS capacity, policy flag, owner password,
or user role changed. A fresh cloud-browser reload displayed the new 12-character
hint; no user credentials were entered in the browser.

Still open: owner-selected account registration and operator authorization,
reviewed photo/verification policies, native device acceptance, real-photo
quality and full enabled end-to-end acceptance. No Stage 33 or production PASS
is claimed.
