#!/bin/bash
set -euo pipefail
python3 - <<'PY'
"""Publish only the reviewed read-only consultation recovery API modules."""
import copy, fcntl, hashlib, json, pathlib, re, subprocess, time, urllib.request, urllib.error

ROOT = pathlib.Path('/opt/epifiz/operations')
PREVIOUS_WORK = ROOT / 'consultation-recovery-20261029'
WORK = ROOT / 'consultation-recovery-20261029-retry-1'
CATALOG_RESULT = ROOT / 'catalog-bindings-20261029/result.json'
ORIGINAL_IMAGE = 'sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64'
IMAGE = None
STARTED = time.monotonic()
BUILDER = 'sha256:9ecf655d9b97645eb91f040489baa1d3da5befb11d6b324a2e539b48fcf19286'
BASE_REF = '123e7339e2ab2a9e8e94f391a8431b73afc28efe'
CANDIDATE_REF = '9112386fc2c029cd8a4977be1f8e467f2dab5694'
SOURCES = {"visual.service":{"baseline":"132dedf165ab734c5e2bb87528127bc23bd26d46","candidate":"95129caac55fb9739cfcbde1e126f4651c346782"},"visual.controller":{"baseline":"352c078569e0e11ede62c86b4ac0679e86696377","candidate":"ca0afbacf9603851a947f49c3bc5b5bb8b01bee2"}}
EXPECTED_FLAGS = {'STAGE33_MVP_ENABLED': 'true', 'MVP_AI_ENABLED': 'true', 'MVP_SEMANTIC_ENABLED': 'true', 'MVP_PHOTO_POLICY_REVIEWED': 'true', 'OPENAI_EMBEDDING_MODEL': 'text-embedding-3-small', 'MVP_AI_DAILY_REQUEST_LIMIT': '5', 'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT': '20'}
PROBE = r"""
const assert=require('node:assert/strict');
require('/application/node_modules/reflect-metadata');
const {VisualService}=require('/application/dist/mvp/visual.service.js');
const {VisualController}=require('/application/dist/mvp/visual.controller.js');
const c=require('/application/node_modules/@nestjs/common/constants.js');
Object.assign(process.env,{STAGE33_MVP_ENABLED:'true',MVP_PHOTO_POLICY_REVIEWED:'true',MVP_PHOTO_POLICY_VERSION:'offline-probe',MVP_PHOTO_NOTICE:'Synthetic probe only',MVP_PHOTO_RETENTION_HOURS:'24',MVP_PHOTO_AUDIT_RETENTION_DAYS:'90',MVP_AI_ENABLED:'false'});
(async()=>{
 let query,calls=0;
 const row={id:'synthetic-session',status:'PLAN',expiresAt:new Date(),createdAt:new Date(),intent:'Synthetic intent',target:'Synthetic target',photo:{consentId:'synthetic-consent'}};
 const self={db:{mvpPhotoAnalysis:{findMany:async q=>{query=q;calls++;return[row]}}}};
 const result=await VisualService.prototype.list.call(self,{id:'synthetic-owner'});
 assert.equal(query.where.ownerId,'synthetic-owner');
 assert.equal(query.where.photo.ownerId,'synthetic-owner');
 assert.equal(query.where.photo.consent.ownerId,'synthetic-owner');
 assert.equal(query.where.photo.consent.policyVersion,'offline-probe');
 assert.equal(query.where.photo.revokedAt,null);
 assert.equal(query.where.photo.deletedAt,null);
 assert.equal(query.where.photo.consent.revokedAt,null);
 assert(query.where.expiresAt.gt instanceof Date);
 assert(query.where.photo.expiresAt.gt instanceof Date);
 assert(query.where.photo.consent.expiresAt.gt instanceof Date);
 assert.equal(query.take,20);
 assert.deepEqual(Object.keys(query.select).sort(),['createdAt','expiresAt','id','intent','photo','status','target']);
 assert.equal(result.items[0].consentId,'synthetic-consent');
 assert(!('photo' in result.items[0]));
 process.env.MVP_PHOTO_POLICY_REVIEWED='false';
 assert.deepEqual(await VisualService.prototype.list.call(self,{id:'synthetic-owner'}),{items:[]});
 assert.equal(calls,1);
 process.env.STAGE33_MVP_ENABLED='false';
 await assert.rejects(()=>VisualService.prototype.list.call(self,{id:'synthetic-owner'}),e=>e.getStatus()===503);
 assert.equal(Reflect.getMetadata(c.PATH_METADATA,VisualController.prototype.list),'visual/sessions');
 assert(Reflect.getMetadata(c.HEADERS_METADATA,VisualController.prototype.list).some(h=>h.name.toLowerCase()==='cache-control'&&h.value==='no-store'));
 console.log('Offline owner/expiry/projection/policy/read-only route contract: PASS');
})().catch(()=>{console.error('Offline recovery contract failed; private diagnostics withheld');process.exitCode=1});
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
    return json.loads(run(['docker', 'inspect', name], timeout=5))[0]

def env(container):
    return dict(x.split('=', 1) for x in container['Config'].get('Env', []) if '=' in x)

def snapshot():
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=beauty-preview'], timeout=10).split()
    require(bool(ids), 'Preview containers unavailable')
    return {c['Config']['Labels'].get('com.docker.compose.service'): c for c in json.loads(run(['docker', 'inspect', *ids], timeout=10))}

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
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=3) as response:
            require(response.status == 200 and response.headers.get('Access-Control-Allow-Origin') == origin, 'Public readiness/CORS failed')

def wait_ready():
    deadline = time.monotonic() + 60
    for attempt in range(20):
        try:
            ready()
            return
        except Exception:
            if attempt == 19 or time.monotonic() >= deadline:
                raise Stop('Readiness deadline reached') from None
            time.sleep(3)


def download(ref, stem, expected, target):
    url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + ref + '/apps/api/src/mvp/' + stem + '.ts'
    with urllib.request.urlopen(url, timeout=20) as response:
        data = response.read(64001)
    require(len(data) <= 64000, 'Pinned source size exceeded')
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    require(actual == expected, 'Pinned source integrity mismatch')
    target.write_bytes(data)

def load_baseline():
    require(not CATALOG_RESULT.is_symlink() and CATALOG_RESULT.is_file(), 'Prior catalog publication record unavailable')
    record = json.loads(CATALOG_RESULT.read_text())
    require(record.get('status') == 'COMPLETED' and record.get('previous') == ORIGINAL_IMAGE, 'Prior catalog publication not completed')
    require(bool(re.fullmatch(r'sha256:[0-9a-f]{64}', record.get('image', ''))), 'Prior API image invalid')
    require(bool(re.fullmatch(r'[0-9a-f]{64}', record.get('moduleSha256', ''))), 'Prior catalog module digest invalid')
    js = "const f=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(f.readFileSync('/application/dist/mvp/mvp.service.js')).digest('hex'))"
    require(run(['docker', 'exec', 'beauty-preview-api-1', 'node', '-e', js]).strip() == record['moduleSha256'], 'Prior catalog module drift')
    return record['image']

def build(original):
    require(original['Image'] == IMAGE, 'Reviewed API image drift')
    require(json.loads(run(['docker', 'image', 'inspect', BUILDER]))[0]['Id'] == BUILDER, 'Reviewed compiler image unavailable')
    for name in ['baseline', 'candidate', 'compiled', 'live']:
        (WORK / name).mkdir(mode=0o700)
    for stem, hashes in SOURCES.items():
        download(BASE_REF, stem, hashes['baseline'], WORK / 'baseline' / (stem + '.ts'))
        download(CANDIDATE_REF, stem, hashes['candidate'], WORK / 'candidate' / (stem + '.ts'))
    # The reviewed source already passed full type/build tests. Emit only the two
    # isolated modules here, then prove byte equality against the live baseline.
    # This avoids a full Nest workspace build on the small preview instance.
    emitter = r"""
const fs=require('node:fs'),path=require('node:path');
const ts=require(require.resolve('typescript',{paths:['/repo/apps/api','/repo']}));
const file='/repo/apps/api/tsconfig.build.json';
const config=ts.readConfigFile(file,ts.sys.readFile);
if(config.error) throw new Error('Compiler configuration unavailable');
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(file),undefined,file);
if(parsed.errors.length||parsed.options.isolatedModules!==true||parsed.options.module!==ts.ModuleKind.NodeNext) throw new Error('Reviewed isolated compiler configuration changed');
const sources=['visual.service','visual.controller'].map(stem=>'/repo/apps/api/src/mvp/'+stem+'.ts');
const program=ts.createProgram(sources,{...parsed.options,declaration:false,noEmitOnError:false});
for(const source of sources){
 const unit=program.getSourceFile(source);
 if(!unit) throw new Error('Reviewed compiler input unavailable');
 let wrote=false;
 const emitted=program.emit(unit,(target,data)=>{
  if(target.endsWith('.js')){
   if(target!=='/repo/apps/api/dist/mvp/'+path.basename(source,'.ts')+'.js') throw new Error('Unexpected emitted module path');
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);wrote=true;
  }
 });
 if(!wrote||emitted.emitSkipped||emitted.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error)) throw new Error('Reviewed module emission failed');
}
console.log('Two program modules emitted; baseline byte comparison is still required');
"""
    emitter_path = WORK / 'emit.cjs'
    emitter_path.write_text(emitter)
    name = 'orzell-consultation-compiler-20261029-retry-1'
    run(['docker', 'create', '--name', name, '--user', '0:0', '--network', 'none', '--memory', '640m', '--cpus', '1', '-e', 'CI=1', '-e', 'NODE_OPTIONS=--max-old-space-size=512', '--entrypoint', 'node', BUILDER, '/tmp/orzell-emit.cjs'])
    try:
        run(['docker', 'cp', str(emitter_path), name + ':/tmp/orzell-emit.cjs'])
        for phase in ['baseline', 'candidate']:
            print('Offline two-module emission: ' + phase, flush=True)
            for stem in SOURCES:
                run(['docker', 'cp', str(WORK / phase / (stem + '.ts')), name + ':/repo/apps/api/src/mvp/' + stem + '.ts'])
            run(['docker', 'start', '-a', name], timeout=90)
            require(inspect(name)['State'].get('ExitCode') == 0, 'Offline module emission failed')
            for stem in SOURCES:
                if phase == 'baseline':
                    baseline = WORK / 'baseline' / (stem + '.js')
                    live = WORK / 'live' / (stem + '.js')
                    run(['docker', 'cp', name + ':/repo/apps/api/dist/mvp/' + stem + '.js', str(baseline)])
                    run(['docker', 'cp', 'beauty-preview-api-1:/application/dist/mvp/' + stem + '.js', str(live)])
                    require(baseline.read_bytes() == live.read_bytes(), 'Compiled baseline differs from current API')
                else:
                    run(['docker', 'cp', name + ':/repo/apps/api/dist/mvp/' + stem + '.js', str(WORK / 'compiled' / (stem + '.js'))])
            print('Offline two-module emission accepted: ' + phase, flush=True)
    finally:
        run(['docker', 'rm', '-f', name])
    run(['docker', 'tag', IMAGE, 'orzell-api:consultation-base-20261029'])
    (WORK / 'Dockerfile').write_text('FROM orzell-api:consultation-base-20261029\nCOPY --chown=node:node compiled/ /application/dist/mvp/\n')
    run(['docker', 'build', '--network', 'none', '--pull=false', '-t', 'orzell-api:consultation-recovery-20261029', str(WORK)], timeout=90)
    candidate = json.loads(run(['docker', 'image', 'inspect', 'orzell-api:consultation-recovery-20261029']))[0]
    base = json.loads(run(['docker', 'image', 'inspect', IMAGE]))[0]
    require(candidate['Config'] == base['Config'], 'Candidate image process metadata changed')
    require(candidate['RootFS']['Layers'][:-1] == base['RootFS']['Layers'], 'Candidate base layers changed')
    probe = 'orzell-consultation-offline-20261029'
    run(['docker', 'create', '--name', probe, '--network', 'none', '--memory', '256m', '--cpus', '1', '--entrypoint', 'node', candidate['Id'], '-e', PROBE])
    try:
        run(['docker', 'start', '-a', probe], timeout=60)
        require(inspect(probe)['State'].get('ExitCode') == 0, 'Offline recovery module contract failed')
    finally:
        run(['docker', 'rm', '-f', probe])
    return candidate['Id'], {stem: hashlib.sha256((WORK / 'compiled' / (stem + '.js')).read_bytes()).hexdigest() for stem in SOURCES}

def verify_module(expected):
    require(set(expected) == set(SOURCES), 'Module digest manifest mismatch')
    js = "const f=require('node:fs'),c=require('node:crypto');const names=" + json.dumps(list(SOURCES)) + ";console.log(JSON.stringify(Object.fromEntries(names.map(n=>[n,c.createHash('sha256').update(f.readFileSync('/application/dist/mvp/'+n+'.js')).digest('hex')]))))"
    require(json.loads(run(['docker', 'exec', 'beauty-preview-api-1', 'node', '-e', js], timeout=10)) == expected, 'Deployed recovery module digest mismatch')

def endpoint_guard():
    try:
        with urllib.request.urlopen('https://preview.13-51-112-228.sslip.io/api/mvp/v1/visual/sessions', timeout=3):
            raise Stop('Private recovery endpoint accepted an unauthenticated request')
    except urllib.error.HTTPError as error:
        require(error.code == 401, 'Recovery endpoint authentication/route check failed')

def apply():
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    marker = WORK / 'result.json'
    if marker.exists():
        record = json.loads(marker.read_text())
        require(record.get('status') == 'COMPLETED', 'Prior incomplete operation; do not replay')
        require(inspect('beauty-preview-api-1')['Image'] == record['image'], 'Completed image drift')
        verify_module(record['moduleSha256'])
        ready()
        endpoint_guard()
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
    overlay = WORK / 'consultation-image.json'
    overlay.write_text(json.dumps({'services': {'api': {'image': image}}}) + '\n')
    candidate = rollback + ['-f', str(overlay)]
    validate_delta(baseline, json.loads(run(candidate + ['config', '--format', 'json'])), image)
    verify_others(before, snapshot())
    record = {'status': 'PREPARED', 'previous': IMAGE, 'image': image, 'moduleSha256': module_digest, 'rollback': rollback, 'providerRequestsStarted': 0}
    marker.write_text(json.dumps(record, indent=2) + '\n')
    print('Offline consultation recovery/route guards and image-only Compose delta: PASS', flush=True)
    attempted = False
    try:
        require(time.monotonic() - STARTED < 300, 'Preparation deadline reached; no live API recreation')
        current = inspect('beauty-preview-api-1')
        require(current['Id'] == original['Id'] and current['Image'] == original['Image'] and env(current) == env(original), 'Concurrent API change')
        attempted = True
        run(candidate + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], timeout=100)
        wait_ready()
        verify_module(module_digest)
        endpoint_guard()
        verify_runtime(original, inspect('beauty-preview-api-1'), image)
        verify_others(before, snapshot())
        record['status'] = 'COMPLETED'
        marker.write_text(json.dumps(record, indent=2) + '\n')
        print('API consultation recovery publication, module digests, health/CORS and unrelated service isolation: PASS')
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


def inspect_failed_preparation():
    require(not PREVIOUS_WORK.is_symlink() and PREVIOUS_WORK.is_dir(), 'Prior preparation directory unavailable')
    require(not (PREVIOUS_WORK / 'result.json').exists(), 'Prior publication state requires review')
    require({p.name for p in PREVIOUS_WORK.iterdir()} == {'baseline', 'candidate', 'compiled', 'live'}, 'Prior preparation inventory requires review')
    for phase in ['baseline', 'candidate', 'compiled', 'live']:
        folder = PREVIOUS_WORK / phase
        require(not folder.is_symlink() and folder.is_dir(), 'Prior preparation path requires review')
        if phase in ['compiled', 'live']:
            require(not list(folder.iterdir()), 'Prior preparation passed first compiler stage; review required')
        else:
            require({p.name for p in folder.iterdir()} == {stem + '.ts' for stem in SOURCES}, 'Prior pinned source inventory changed')
            for stem, hashes in SOURCES.items():
                source = folder / (stem + '.ts')
                require(not source.is_symlink(), 'Prior source cannot be a symlink')
                data = source.read_bytes()
                require(len(data) <= 64000 and hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == hashes[phase], 'Prior pinned source digest mismatch')
    require(not run(['docker', 'ps', '-aq', '--filter', 'name=^/orzell-consultation-compiler-20261029$']).strip(), 'Prior compiler still exists; no retry')
    require(inspect('beauty-preview-api-1')['Image'] == IMAGE, 'Prior API image changed; no retry')
    ready()
    print('Prior attempt stopped before first emitted module; original healthy API retained: PASS', flush=True)


def main():
    global IMAGE
    ROOT.mkdir(exist_ok=True)
    with open(ROOT / 'consultation-recovery-20261029.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        IMAGE = load_baseline()
        if not (WORK / 'result.json').exists():
            inspect_failed_preparation()
        apply()

try:
    main()
except Exception as error:
    print(str(error) if isinstance(error, Stop) else 'Operation stopped; private diagnostics withheld')
    raise SystemExit(1)
PY
