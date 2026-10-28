# ORZELL preview matching: controlled activation

The owner reached a completed consultation plan on physical iPhone TestFlight
1.0.0 (1051). “Plana göre profesyonel ara” then returned the generic unavailable
message. This supersedes the earlier unresolved photo-upload diagnosis.

## Verified diagnosis

[Read-only runtime inspection 40679930984](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40679930984)
and [catalog prerequisite inspection 40680311960](https://github.com/umutbarut7-svg/Beauty-platform/actions/runs/40680311960)
completed successfully. API and worker both had `MVP_SEMANTIC_ENABLED=false`.
The vector extension and catalog-vector table exist. There was one public,
active, bookable service, zero vector rows and zero current indexed services.
The public API readiness checks returned HTTP 200. These are inspection-time
facts, not a guarantee that runtime or catalog state cannot change.

`OPENAI_API_KEY` was absent from Docker Config.Env; the established bootstrap
loads the owner's previously selected encrypted key into child-process memory.
Docker Config.Env therefore cannot diagnose missing provider credentials.

## Prepared change and exact scope

`infra/preview/semantic-enabled.yml` is an optional Compose overlay. It changes
only `MVP_SEMANTIC_ENABLED` to `true` for the existing API and worker services.
It is not referenced by the default Compose stack or any deployment workflow.
Creating this file or merging this preparation does not activate the feature.

Activation requires explicit owner approval of the live preview change. Prepare
the API and worker commands independently from each container's current
`com.docker.compose.project.config_files` and
`com.docker.compose.project.environment_file` labels. The two services currently
use different Compose inputs. Preserve every existing input in its original
order and append this overlay last. Never reconstruct either service with the
other service's Compose files.

Before execution:

1. Reinspect both live service identities, running images and complete effective
   settings without printing secrets. Compare each candidate `docker compose
config --format json` service against its current inputs. The only allowed
   effective environment difference is `MVP_SEMANTIC_ENABLED: false -> true`.
2. Confirm the current reviewed photo settings, original retention, embedding
   model `text-embedding-3-small`, and user/global daily limits `5/20`. Keep
   verification closed. Stop on drift rather than restoring stale assumptions.
3. Retain the original Compose inputs as the rollback commands. Confirm the
   expected existing images locally; use `up -d --no-deps --no-build --pull never`
   for each named service only. No migration, framework build, image update,
   capacity, IAM or secret creation is part of this change.
4. Record PostgreSQL, gateway, admin and secret-helper identities/start times
   for comparison. The API/worker recreation can briefly interrupt requests;
   perform it between the owner's photo/analysis actions.

After both services are healthy, verify their effective flags and both public
HTTPS readiness/CORS endpoints. Check the authenticated capabilities response
for `matching.semanticVectorAvailable=true`. This field is configuration-only;
it does not prove a populated catalog or useful recommendations. If activation
acceptance fails, recreate the changed services using their respective original
inputs and recheck health. No secret value is printed or copied.

## Indexing and acceptance require separate explicit actions

Enabling the gate alone leaves the inspected catalog empty. Use the existing
authenticated business owner's console to select the one published service and
tap its “aramayı güncelle” action. This calls the existing authorized,
idempotent `semantic-index` endpoint; the worker retains permission checks,
source-version validation, safety/kill switches, quotas and one job attempt.
Do not impersonate a user, mint an operator token, modify memberships, insert a
vector directly or bypass the application's authorization and provider guards.

The index sends the public business name, service name and description (up to
4,000 characters) to the existing embedding provider. One successful initial
index requires one embedding request. After its job succeeds and a fresh vector
exists, one explicit synthetic business-search acceptance requires another
embedding request. Do not automatically retry either paid operation. Both count
toward the existing limits. No customer photo or saved consultation is needed
for this transport/index acceptance. The owner's actual plan search remains an
explicit action on their phone.

If indexing or search fails, inspect the bounded job/error result without
exposing input text. Keep the paid request count and any index already written
in the final report. Rolling the semantic flag back does not undo provider
usage, delete the vector or erase audit/job records. A single indexed service
does not demonstrate broad recommendation coverage or recommendation quality.

## Related application correction

The prepared mobile correction checks authenticated capabilities when PLAN
loads and immediately before an explicit matching request. Closed or failed
capability reads preserve the plan and show a specific message with refresh.
A matching HTTP 503 also preserves the plan. Genuine NO_MATCH remains distinct,
and late results cannot reappear after withdrawal. Capability reads never start
analysis, indexing or a paid matching request.

## Owner-approved execution

On 28 October 2026 the owner explicitly approved enabling semantic matching,
recreating the API/worker and using the existing OpenAI key for at most two
embedding requests: the published service index and one synthetic search.

The checked-in preview operation preserves each service's own Compose inputs,
compares the running configuration hash and locally available image, and permits
only the semantic environment flag to change. It refuses queued semantic jobs,
model/quota/feature drift and concurrent target changes. The operation retains
rollback inputs, checks HTTPS readiness/CORS and confirms unrelated container
identities and start times. Failure after recreation rolls attempted services
back in reverse order. A completed or failed operation record blocks replay.

Ten offline tests cover successful activation, replay protection, partial API
failure and rollback, queued jobs, configuration hash drift, overlay drift,
model drift, runtime image/environment drift and failed-record protection.

The operation itself starts zero paid requests. The two authorized requests
still require the existing business owner's normal authenticated console;
no operator token, impersonation or membership changes are introduced.

## Status

Owner approval received; live execution and authenticated index/search results
must be recorded before claiming success. The companion mobile correction is
PR #54 and has not been distributed as another TestFlight build. Stage 33
acceptance remains open.
