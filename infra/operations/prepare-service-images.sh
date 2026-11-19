#!/usr/bin/env bash
set -euo pipefail
source_sha=0fae2655395df7dcbd580f1ab85295b1d3a6e1f3
origin=https://preview.13-51-112-228.sslip.io
api=orzell-preview-service-api:${source_sha:0:12}
web=orzell-preview-service-web:${source_sha:0:12}
test "$(git -C application rev-parse HEAD)" = "$source_sha"
mkdir -p application/infra release
cp -a harness/infra/preview application/infra/
dockerfile=application/infra/preview/Dockerfile
# Use the established preview build stages. Include public brand assets in the web image.
cat >> "$dockerfile" <<'DOCKER'
FROM admin AS service-web
COPY --from=admin-build --chown=node:node /repo/apps/admin/public/ /application/public/
DOCKER
docker build -f "$dockerfile" --target api --label org.opencontainers.image.revision="$source_sha" -t "$api" application
docker build -f "$dockerfile" --target service-web --build-arg ADMIN_API_URL="$origin/api" --label org.opencontainers.image.revision="$source_sha" -t "$web" application
docker run --rm --network none --entrypoint node "$api" -e "require('./dist/discovery/shared-service.controller.js');require('./dist/discovery/shared-service.service.js');require('./dist/app.module.js')"
docker run -d --name service-entry-web --network none --memory 256m --cap-drop ALL --security-opt no-new-privileges:true -e ORZELL_PUBLIC_ORIGIN="$origin" "$web"
trap 'docker rm -f service-entry-web >/dev/null' EXIT
docker exec -i service-entry-web node <<'NODE'
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
async function check() {
  const base='http://127.0.0.1:3000';
  for (let i=0;i<100;i++) {
    try { if ((await fetch(base+'/login')).ok) break; } catch {}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  for (const path of ['/discover/service','/book/service']) {
    const response=await fetch(base+path);
    assert.equal(response.status,200);
    assert.match(await response.text(),/Geçersiz bağlantı/);
  }
  assert.match(await (await fetch(base+'/login')).text(),/Giriş yap/);
  const logo = await fetch(base+'/orzell-original-reference.jpg');
  assert.equal(crypto.createHash('sha256').update(Buffer.from(await logo.arrayBuffer())).digest('hex'),'16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4');
}
check().catch(error=>{console.error(error);process.exitCode=1});
NODE
docker save "$api" "$web" | gzip -1 > release/images.tar.gz
python3 - "$source_sha" "$api" "$web" <<'PY'
import hashlib, json, pathlib, subprocess, sys
path = pathlib.Path('release/images.tar.gz')
def identity(tag):
    return subprocess.check_output(['docker', 'image', 'inspect', '--format', '{{.Id}}', tag], text=True).strip()
with path.open('rb') as stream:
    manifest = {'source': sys.argv[1], 'api': identity(sys.argv[2]), 'admin': identity(sys.argv[3]), 'archiveSha256': hashlib.file_digest(stream, 'sha256').hexdigest(), 'archiveBytes': path.stat().st_size}
path.with_name('manifest.json').write_text(json.dumps(manifest)+'\n')
print(json.dumps(manifest))
PY
