#!/bin/bash
set -euo pipefail
python3 - <<'PY'
"""Restore the missing public staff-location projection on the existing preview."""
import copy, fcntl, hashlib, json, pathlib, subprocess, time, urllib.request

ROOT = pathlib.Path('/opt/epifiz/operations')
WORK = ROOT / 'catalog-bindings-20261029'
IMAGE = 'sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64'
MODULE = '/application/dist/mvp/mvp.service.js'
EXPECTED_METHOD = "async catalog(businessId) {\n        this.enabled();\n        const business = await this.db.business.findFirst({\n            where: { id: businessId, status: \"ACTIVE\", isPublic: true },\n            select: {\n                id: true,\n                name: true,\n                isVerified: true,\n                services: {\n                    where: { isActive: true, isBookable: true },\n                    select: {\n                        id: true,\n                        name: true,\n                        price: true,\n                        currency: true,\n                        durationMinutes: true,\n                    },\n                    take: 100,\n                },\n                locations: {\n                    where: { isActive: true },\n                    select: { id: true, name: true },\n                    take: 50,\n                },\n                staff: {\n                    where: { isActive: true, acceptsBookings: true },\n                    select: {\n                        id: true,\n                        displayName: true,\n                        services: {\n                            where: { isActive: true },\n                            select: { serviceId: true },\n                        },\n                    },\n                    take: 100,\n                },\n            },\n        });\n        if (!business)\n            throw new common_1.NotFoundException(\"Public business not found\");\n        return business;\n    }"
EXPECTED_FLAGS = {'STAGE33_MVP_ENABLED': 'true', 'MVP_AI_ENABLED': 'true', 'MVP_SEMANTIC_ENABLED': 'true', 'MVP_PHOTO_POLICY_REVIEWED': 'true', 'OPENAI_EMBEDDING_MODEL': 'text-embedding-3-small', 'MVP_AI_DAILY_REQUEST_LIMIT': '5', 'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT': '20'}
PROBE = r"""
const assert = require('node:assert/strict');
const {MvpService} = require('/application/dist/mvp/mvp.service.js');
const {Prisma} = require('/application/node_modules/@prisma/client');
assert(Prisma.dmmf.datamodel.models.find(m=>m.name==='Staff').fields.some(f=>f.name==='locations'&&f.type==='StaffLocation'));
assert(Prisma.dmmf.datamodel.models.find(m=>m.name==='StaffLocation').fields.some(f=>f.name==='locationId'));
(async()=>{
 let query, enabled=0;
 const result={id:'synthetic-business',staff:[{id:'synthetic-staff',locations:[{locationId:'synthetic-branch'}]}]};
 const self={enabled(){enabled++},db:{business:{findFirst:async q=>{query=q;return result}}}};
 assert.equal(await MvpService.prototype.catalog.call(self,'synthetic-business'),result);
 assert.deepEqual(query.where,{id:'synthetic-business',status:'ACTIVE',isPublic:true});
 assert.deepEqual(query.select.staff.where,{isActive:true,acceptsBookings:true});
 assert.deepEqual(query.select.staff.select.locations,{select:{locationId:true}});
 assert.deepEqual(query.select.staff.select.services,{where:{isActive:true},select:{serviceId:true}});
 assert.deepEqual(query.select.locations.where,{isActive:true});
 assert.deepEqual(query.select.services.where,{isActive:true,isBookable:true});
 assert.equal(enabled,1);
 self.db.business.findFirst=async()=>null;
 await assert.rejects(()=>MvpService.prototype.catalog.call(self,'private-business'),e=>e.getStatus()===404);
 self.enabled=()=>{throw Error('gate-closed')};
 await assert.rejects(()=>MvpService.prototype.catalog.call(self,'synthetic-business'),/gate-closed/);
 console.log('Catalog projection, Prisma relation, public/active/service/feature guards: PASS');
})().catch(()=>{console.error('Offline catalog contract failed; diagnostics withheld');process.exitCode=1});
"""

class Stop(Exception):
    pass

def require(ok, message):
    if not ok:
        raise Stop(message)

def run(args, timeout=40):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop('Operation command unavailable or timed out') from None
    require(p.returncode == 0, 'Operation command failed; private output withheld')
    return p.stdout

def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]

def env(container):
    return dict(x.split('=', 1) for x in container['Config'].get('Env', []) if '=' in x)

def snapshot():
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=beauty-preview']).split()
    require(bool(ids), 'Preview containers unavailable')
    return {c['Config']['Labels'].get('com.docker.compose.service'): c for c in json.loads(run(['docker', 'inspect', *ids]))}

def compose(container):
    labels = container['Config']['Labels']
    require(labels.get('com.docker.compose.project') == 'beauty-preview', 'Unexpected Compose project')
    working = labels.get('com.docker.compose.project.working_dir', '')
    require(working.startswith('/opt/epifiz/') and pathlib.Path(working).is_dir(), 'Original Compose directory unavailable')
    args = ['docker', 'compose', '-p', 'beauty-preview', '--project-directory', working]
    for name in labels.get('com.docker.compose.project.environment_file', '').split(','):
        require(name.startswith('/opt/epifiz/') and pathlib.Path(name).is_file(), 'Original environment input unavailable')
        args += ['--env-file', name]
    for name in labels.get('com.docker.compose.project.config_files', '').split(','):
        require(name.startswith('/opt/epifiz/') and pathlib.Path(name).is_file(), 'Original Compose input unavailable')
        args += ['-f', name]
    return args

def patch_source(text):
    start = text.find('async catalog(')
    end = text.find('async bookings(', start)
    require(start >= 0 and end > start, 'Catalog method boundary drift')
    require(text[start:end].strip() == EXPECTED_METHOD, 'Compiled catalog source drift')
    before = 'displayName: true,\n                        services:'
    after = 'displayName: true,\n                        locations: { select: { locationId: true } },\n                        services:'
    require(EXPECTED_METHOD.count(before) == 1 and text.count(EXPECTED_METHOD) == 1, 'Catalog projection anchor drift')
    return text.replace(EXPECTED_METHOD, EXPECTED_METHOD.replace(before, after, 1), 1)

def validate_delta(original, candidate, image):
    proposed = copy.deepcopy(candidate)
    require(proposed['services']['api'].get('image') == image, 'Candidate image mismatch')
    proposed['services']['api']['image'] = original['services']['api']['image']
    require(proposed == original, 'Candidate changes more than the API image')

def verify_runtime(original, current, image):
    require(current['Image'] == image, 'API image mismatch')
    require(env(current) == env(original), 'API environment changed')
    for key in ['Cmd', 'Entrypoint', 'User', 'WorkingDir']:
        require(current['Config'].get(key) == original['Config'].get(key), 'API process settings changed')
    require(current['HostConfig'] == original['HostConfig'], 'API host settings changed')

def verify_others(before, after):
    require(set(before) == set(after), 'Preview inventory changed')
    for service in set(before) - {'api'}:
        require(all(before[service].get(k) == after[service].get(k) for k in ['Id', 'Image', 'RestartCount']) and before[service]['State']['StartedAt'] == after[service]['State']['StartedAt'], 'Unrelated service changed')

def ready():
    c = inspect('beauty-preview-api-1')
    require(c['State'].get('Running') and c['State'].get('Health', {}).get('Status') == 'healthy', 'API not healthy')
    require(inspect('beauty-preview-worker-1')['State'].get('Running'), 'Worker not running')
    for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
        origin = 'https://' + host
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=10) as response:
            require(response.status == 200 and response.headers.get('Access-Control-Allow-Origin') == origin, 'Public readiness/CORS failed')

def wait_ready():
    for attempt in range(20):
        try:
            ready()
            return
        except Exception:
            if attempt == 19:
                raise Stop('Readiness deadline reached') from None
            time.sleep(3)

def build(original):
    name = 'orzell-catalog-offline-20261029'
    file = WORK / 'mvp.service.js'
    require(original['Image'] == IMAGE, 'Reviewed API base image drift')
    run(['docker', 'cp', 'beauty-preview-api-1:' + MODULE, str(file)])
    original_source = file.read_bytes()
    patched = patch_source(original_source.decode())
    file.write_text(patched)
    run(['docker', 'create', '--name', name, '--network', 'none', '--memory', '256m', '--cpus', '1', '--entrypoint', 'node', IMAGE, '-e', PROBE])
    try:
        baseline = WORK / 'base-mvp.service.js'
        run(['docker', 'cp', name + ':' + MODULE, str(baseline)])
        require(baseline.read_bytes() == original_source, 'Live module differs from reviewed base image')
        run(['docker', 'cp', str(file), name + ':' + MODULE])
        run(['docker', 'start', '-a', name], timeout=60)
        state = inspect(name)['State']
        require(state.get('ExitCode') == 0, 'Offline catalog probe failed')
    finally:
        run(['docker', 'rm', '-f', name])
    run(['docker', 'tag', IMAGE, 'orzell-api:catalog-base-20261029'])
    (WORK / 'Dockerfile').write_text('FROM orzell-api:catalog-base-20261029\nCOPY --chown=node:node mvp.service.js ' + MODULE + '\n')
    run(['docker', 'build', '--network', 'none', '--pull=false', '-t', 'orzell-api:catalog-bindings-20261029', str(WORK)], timeout=90)
    candidate = json.loads(run(['docker', 'image', 'inspect', 'orzell-api:catalog-bindings-20261029']))[0]
    base = json.loads(run(['docker', 'image', 'inspect', IMAGE]))[0]
    require(candidate['Config'] == base['Config'], 'Image process metadata changed')
    require(candidate['RootFS']['Layers'][:-1] == base['RootFS']['Layers'], 'Candidate base layers changed')
    return candidate['Id'], hashlib.sha256(patched.encode()).hexdigest()

def verify_module(digest):
    js = "const f=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(f.readFileSync(" + json.dumps(MODULE) + ")).digest('hex'))"
    require(run(['docker', 'exec', 'beauty-preview-api-1', 'node', '-e', js]).strip() == digest, 'Deployed module digest mismatch')

def apply():
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    marker = WORK / 'result.json'
    if marker.exists():
        record = json.loads(marker.read_text())
        require(record.get('status') == 'COMPLETED', 'Prior incomplete operation; do not replay')
        require(inspect('beauty-preview-api-1')['Image'] == record['image'], 'Completed image drift')
        verify_module(record['moduleSha256'])
        ready()
        print('Already completed; no service recreation or provider request')
        return
    require(not WORK.exists(), 'Prior operation directory; inspect before replay')
    before = snapshot()
    require(all(s in before for s in ['api', 'worker', 'postgres', 'gateway', 'admin', 'prepare-secrets']), 'Expected services missing')
    ready()
    original = before['api']
    require(original['Image'] == IMAGE, 'Reviewed API image drift')
    require(all(env(original).get(k) == v for k, v in EXPECTED_FLAGS.items()), 'Reviewed feature/model/quota drift')
    rollback = compose(original)
    baseline = json.loads(run(rollback + ['config', '--format', 'json']))
    digest = run(rollback + ['config', '--hash', 'api']).split()
    require(digest and digest[-1] == original['Config']['Labels'].get('com.docker.compose.config-hash'), 'Compose input drift')
    require(json.loads(run(['docker', 'image', 'inspect', baseline['services']['api']['image']]))[0]['Id'] == IMAGE, 'Original image input drift')
    WORK.mkdir(mode=0o700)
    image, module_digest = build(original)
    overlay = WORK / 'catalog-image.json'
    overlay.write_text(json.dumps({'services': {'api': {'image': image}}}) + '\n')
    candidate = rollback + ['-f', str(overlay)]
    validate_delta(baseline, json.loads(run(candidate + ['config', '--format', 'json'])), image)
    verify_others(before, snapshot())
    record = {'status': 'PREPARED', 'previous': IMAGE, 'image': image, 'moduleSha256': module_digest, 'rollback': rollback, 'providerRequestsStarted': 0}
    marker.write_text(json.dumps(record, indent=2) + '\n')
    print('Offline catalog contract/Prisma guards and image-only Compose delta: PASS', flush=True)
    attempted = False
    try:
        current = inspect('beauty-preview-api-1')
        require(current['Id'] == original['Id'] and current['Image'] == original['Image'] and env(current) == env(original), 'Concurrent API change')
        attempted = True
        run(candidate + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=100)
        wait_ready()
        verify_module(module_digest)
        verify_runtime(original, inspect('beauty-preview-api-1'), image)
        verify_others(before, snapshot())
        record['status'] = 'COMPLETED'
        marker.write_text(json.dumps(record, indent=2) + '\n')
        print('API catalog binding publication, module digest, health/CORS and unrelated service isolation: PASS')
        print('No database migration/write, booking, setting/key change or paid provider request')
    except Exception:
        ok = True
        if attempted:
            try:
                run(rollback + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=100)
                wait_ready()
                verify_runtime(original, inspect('beauty-preview-api-1'), IMAGE)
                verify_others(before, snapshot())
            except Exception:
                ok = False
        record['status'] = 'ROLLED_BACK' if ok else 'ROLLBACK_NEEDS_REVIEW'
        marker.write_text(json.dumps(record, indent=2) + '\n')
        raise Stop('Publication stopped; rollback ' + ('PASS' if ok else 'NEEDS REVIEW')) from None

def main():
    ROOT.mkdir(exist_ok=True)
    with open(ROOT / 'catalog-bindings-20261029.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        apply()

try:
    main()
except Exception as error:
    print(str(error) if isinstance(error, Stop) else 'Operation stopped; private diagnostics withheld')
    raise SystemExit(1)
PY
