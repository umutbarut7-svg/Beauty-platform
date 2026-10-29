# Publish CI-built consultation recovery modules

Both preview preparations stopped before producing the first module. Run
40857189615 / SSM 0814bf1b-6f0d-49b5-927a-ce0c5e5ac5e0 confirmed the original
healthy API and intact first preparation, then hit the bounded baseline compiler
timeout. Neither attempt is live publication acceptance.

The preview now performs no TypeScript/Nest compilation. A dedicated main-only
workflow installs the exact frozen application at
9112386fc2c029cd8a4977be1f8e467f2dab5694 and builds both reviewed source variants.
Actual source Git blob hashes are checked before each full build. Only the two
JavaScript modules from each variant enter a bounded private payload. It contains
no environment, user records, provider credentials or photo data.

The compiled bytes remain in a mode-0600 temporary runner file and the existing
owner-account SSM deployment input; their contents are never printed to CI logs,
committed as generated public files, or uploaded as a public artifact. The
transport checks bounded decompression, SHA-256 and private-file creation. The
repository's existing temporary OIDC operations role and exact instance are
reused without IAM changes. The main-only deployment job obtains that identity
only after the module build succeeds. The PR safety job has read-only contents
permission and performs no deployment or provider request.

The remote helper inspects both preserved failed preparations and requires no
emitted modules, no publication marker, no compiler, the exact reviewed sources
and emitter, and the original healthy API image. It then requires the CI-built
baseline bytes to equal the current API before creating an image that changes
only the two reviewed JavaScript modules. Existing catalog/module/Compose,
authentication, health/CORS, unrelated-service and rollback guards remain.
The separate CI publication directory preserves no-replay behavior. No database
migration/write, new AI request, photo read, key/quota change or public store
release is included.

Validation includes offline failure/rollback/privacy-envelope tests and a full
build of both reviewed module variants. The safety workflow parses the actual
private transport and verifies its command-size bound without contacting AWS.
Live publication, signed internal TestFlight delivery, physical-phone saved-plan
and recommendation-quality acceptance remain distinct checks. Stage 33 remains
open until all remaining acceptance gates have evidence.
