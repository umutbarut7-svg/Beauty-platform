# Appointment materials preview delivery

Pinned application: `2e56def282c97a804a2f3d6c9b36a53b42a09df5` (#92).
Pinned image rehearsal: 41984536054, preparation source
`40b93fadca5ddc955bbb62d4f3b73dc5827d516f` (#93); repository gate
41984536356 passed. Artifact 13395980505 expires 8 November 2026 at
10:05 Istanbul; revalidate its actual expiry before use.

- ZIP: 772119203 bytes; SHA-256 b804b74ca4cb989f7d0ed8916fe3bf2956c75965d7c26cdd2049df49ad7bfd9d.
- images.tar.gz: 772114585 bytes; SHA-256 12c149596cb90ecff1c76a4120874356638fa6db17370e53c9b64f964a3411a4.
- API/worker: sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e.
- Migration image: sha256:269f7e6ce2e603270c30927c326c0b97de519bab9bdd7b527bb7966a0e4affb9.

The isolated real compiled inventory/B2B/material tests passed in API and worker
images. The first application candidate rejected new operation types against the
existing database CHECK; the corrected source preserves IMPORT/MOVEMENT and adds
explicit JSON receipt kind tags. No schema migration or CHECK relaxation is needed.

## Narrow publication

The existing main/OIDC/SSM preview identity and one existing EC2 target are reused.
The request is `orzell-appointment-materials-publication-20261105-1`. Before any
server command, the dispatcher requires all four exact application-source gates,
the exact preparation gate and immutable image rehearsal/artifact.

The host requires the previous catalog/B2B publication to be COMPLETED with its
reviewed source, migration hashes and feature activation. It verifies the current
930a5606... API/worker images, original quotas, closed paid-test window, empty
embedding queue, all five inventory/B2B tables and an identical completed migration
inventory. It cannot run migrations or change flags, environment values, security
settings, credentials, retention or unrelated services.

Only the two service images change. Worker verification precedes API startup;
readiness/CORS, deployed module/model identity, unchanged schema and unauthenticated
401 rejection for materials GET/POST and existing private routes are checked.
Rollback preserves the candidate privacy worker once the candidate API has been
attempted; it does not delete schema/data or blindly rerun an uncertain operation.

22 local behavior tests cover artifact integrity, provenance, exact-source gates,
image-only overlays, schema invariance, sequence and rollback. CI repeats them on
the runner and the observed host's Python 3.9 family. Publication is pending until
the request's actual main-run and host result are successful. A phone release is
separate; no real material entry or paid AI action is requested by this workflow.
