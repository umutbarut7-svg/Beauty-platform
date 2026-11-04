#!/bin/bash
set -euo pipefail

release_source=04009b390d014431fe0d4fd99c965e2ce134fa20
api_image=orzell-visual-service-api:04009b390d01
migrate_image=orzell-visual-service-migrate:04009b390d01
test_network=orzell-visual-service-isolated
test_postgres=orzell-visual-service-postgres
test_api=orzell-visual-service-api
test_worker=orzell-visual-service-worker

test "$(git -C application rev-parse HEAD)" = "$release_source"
test "$(git -C harness hash-object infra/preview/Dockerfile)" = 57401f445e071f03adb0b73f5a94e581379b1275
mkdir -p application/infra release
cp -a harness/infra/preview application/infra/
docker build -f application/infra/preview/Dockerfile --target api -t "$api_image" application
docker build -f application/infra/preview/Dockerfile --target migrate -t "$migrate_image" application
docker pull pgvector/pgvector:0.8.7-pg17-trixie

cleanup() {
  docker rm -f "$test_api" "$test_worker" "$test_postgres" >/dev/null 2>&1 || true
  docker network rm "$test_network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# No outbound path exists from the rehearsal containers. No cloud identity is supplied.
docker network create --internal "$test_network"
docker run -d --name "$test_postgres" --network "$test_network" --network-alias postgres \
  -e POSTGRES_DB=beauty_preview -e POSTGRES_USER=beauty \
  -e POSTGRES_PASSWORD=disposable-ci-only-password \
  pgvector/pgvector:0.8.7-pg17-trixie
for attempt in $(seq 1 30); do
  if docker exec "$test_postgres" pg_isready -U beauty -d beauty_preview; then break; fi
  test "$attempt" -lt 30
  sleep 2
done
runtime_env=(-e NODE_ENV=test -e PREVIEW_CI_FIXTURE=true -e AWS_REGION=eu-north-1 \
  -e DB_HOST=postgres -e STAGE33_MVP_ENABLED=false -e MVP_AI_ENABLED=false \
  -e MVP_SEMANTIC_ENABLED=false -e MVP_S3_ENABLED=false -e MVP_REDIS_ENABLED=false \
  -e CORS_ORIGINS=https://fixture.example.test -e PORT=3001)
docker run --rm --network "$test_network" "${runtime_env[@]}" "$migrate_image" migrate
docker run -d --name "$test_worker" --network "$test_network" "${runtime_env[@]}" "$api_image" worker
docker run -d --name "$test_api" --network "$test_network" "${runtime_env[@]}" "$api_image" api
for attempt in $(seq 1 30); do
  if docker exec "$test_api" node -e "fetch('http://127.0.0.1:3001/health/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"; then break; fi
  test "$attempt" -lt 30
  sleep 2
done
test "$(docker inspect --format '{{.State.Running}}' "$test_worker")" = true
test "$(docker inspect --format '{{.RestartCount}}' "$test_worker")" = 0
docker exec "$test_api" node -e "fetch('http://127.0.0.1:3001/mvp/v1/visual/sessions').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"
docker exec -i "$test_api" node < harness/infra/operations/verify-visual-service-image.cjs > release/api-evidence.json
docker exec -i "$test_worker" node < harness/infra/operations/verify-visual-service-image.cjs > release/worker-evidence.json
cmp release/api-evidence.json release/worker-evidence.json
cleanup
trap - EXIT
docker save "$api_image" "$migrate_image" | gzip -1 > release/images.tar.gz
python3 - <<'PY'
import hashlib,json,pathlib,subprocess
root=pathlib.Path('release')
archive=root/'images.tar.gz'
if archive.stat().st_size>2_000_000_000:
    raise SystemExit('Bounded release archive size exceeded')
digest=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
def image_id(name):
    return subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',name],text=True).strip()
manifest={'source':'04009b390d014431fe0d4fd99c965e2ce134fa20','images':{'api':image_id('orzell-visual-service-api:04009b390d01'),'migrate':image_id('orzell-visual-service-migrate:04009b390d01')},'archive':{'name':'images.tar.gz','bytes':archive.stat().st_size,'sha256':digest},'rehearsal':'PASS','liveDeployment':False,'providerRequests':0}
(root/'release.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest))
PY
