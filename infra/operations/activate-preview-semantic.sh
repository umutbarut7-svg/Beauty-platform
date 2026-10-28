#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import copy, fcntl, json, os, pathlib, subprocess, time, urllib.request

ROOT = pathlib.Path('/opt/epifiz/operations')
WORK = ROOT / 'semantic-matching-approved-20261028'
SERVICES = ['worker', 'api']
FLAG = 'MVP_SEMANTIC_ENABLED'
EXPECTED = {'STAGE33_MVP_ENABLED': 'true', 'MVP_AI_ENABLED': 'true', 'MVP_S3_ENABLED': 'true', 'MVP_PHOTO_POLICY_REVIEWED': 'true', 'MVP_VERIFICATION_POLICY_REVIEWED': 'false', 'OPENAI_EMBEDDING_MODEL': 'text-embedding-3-small', 'MVP_AI_DAILY_REQUEST_LIMIT': '5', 'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT': '20'}

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
    require(p.returncode == 0, 'Operation command failed; raw output withheld')
    return p.stdout

def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]

def env(container):
    return dict(x.split('=', 1) for x in container['Config'].get('Env', []) if '=' in x)

def snapshot():
    ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=beauty-preview']).split()
    require(bool(ids), 'Preview project containers unavailable')
    containers = json.loads(run(['docker', 'inspect', *ids]))
    return {c['Config']['Labels'].get('com.docker.compose.service'): c for c in containers}

def compose(container):
    labels = container['Config']['Labels']
    require(labels.get('com.docker.compose.project') == 'beauty-preview', 'Unexpected Compose project')
    base = ['docker', 'compose', '-p', 'beauty-preview']
    working = labels.get('com.docker.compose.project.working_dir', '')
    require(working.startswith('/opt/epifiz/') and pathlib.Path(working).is_dir(), 'Missing original Compose working directory')
    base += ['--project-directory', working]
    for filename in labels.get('com.docker.compose.project.environment_file', '').split(','):
        require(filename.startswith('/opt/epifiz/') and pathlib.Path(filename).is_file(), 'Missing original Compose environment input')
        base += ['--env-file', filename]
    filenames = labels.get('com.docker.compose.project.config_files', '').split(',')
    for filename in filenames:
        require(filename.startswith('/opt/epifiz/') and pathlib.Path(filename).is_file(), 'Missing original Compose file')
        base += ['-f', filename]
    return base

def validate_delta(before, after, service):
    current, candidate = copy.deepcopy(before['services'][service]), copy.deepcopy(after['services'][service])
    require(current.get('environment', {}).get(FLAG) == 'false', 'Baseline semantic flag drift')
    require(candidate.get('environment', {}).get(FLAG) == 'true', 'Candidate semantic flag invalid')
    candidate['environment'][FLAG] = 'false'
    require(current == candidate, 'Candidate changes more than the semantic flag')

def ready():
    api = inspect('beauty-preview-api-1')
    require(api['State'].get('Running') and api['State'].get('Health', {}).get('Status') == 'healthy', 'API health not ready')
    require(inspect('beauty-preview-worker-1')['State'].get('Running'), 'Worker not running')
    for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
        origin = 'https://' + host
        with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=10) as reply:
            require(reply.status == 200, 'Public API not ready')
            require(reply.headers.get('Access-Control-Allow-Origin') == origin, 'Public API CORS mismatch')

def wait_ready():
    for attempt in range(20):
        try:
            ready()
            return
        except Exception:
            if attempt == 19:
                raise Stop('Health acceptance deadline reached') from None
            time.sleep(3)

def sql(query):
    return run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', 'SET statement_timeout=5000; BEGIN READ ONLY; ' + query + '; COMMIT;']).strip()

def check_queues():
    count = int(sql("SELECT count(*) FROM \"BackgroundJob\" WHERE type='MVP_CATALOG_EMBED_V1' AND status IN ('PENDING','RETRYING','PROCESSING')"))
    require(count == 0, 'Pending semantic jobs require review before activation')

def verify_changed(original, current, flag):
    expected = env(original)
    expected[FLAG] = flag
    require(env(current) == expected, 'Runtime environment drift after recreation')
    require(current['Image'] == original['Image'], 'Runtime image changed')
    for key in ['Cmd', 'Entrypoint', 'User', 'WorkingDir']:
        require(current['Config'].get(key) == original['Config'].get(key), 'Runtime process configuration changed')
    require(current['HostConfig'] == original['HostConfig'], 'Runtime host configuration changed')

def activate():
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    marker = WORK / 'result.json'
    if marker.exists():
        result = json.loads(marker.read_text())
        require(result.get('status') == 'COMPLETED', 'Existing operation needs inspection; do not resend')
        require(all(env(inspect('beauty-preview-' + s + '-1')).get(FLAG) == 'true' for s in SERVICES), 'Completed operation flag drift')
        ready()
        print('Already completed; no service recreation or paid request')
        return
    before = snapshot()
    require(all(s in before for s in ['api', 'worker', 'postgres', 'gateway', 'admin', 'prepare-secrets']), 'Expected preview services missing')
    ready()
    check_queues()
    originals, configs = {}, {}
    for service in SERVICES:
        current = before[service]
        require(current['State'].get('Running'), 'Target service is not running')
        values = env(current)
        require(all(values.get(k) == v for k, v in EXPECTED.items()), 'Reviewed feature/model/quota settings drift')
        require(values.get(FLAG) == 'false', 'Semantic flag already changed; inspect first')
        originals[service] = compose(current)
        config = json.loads(run(originals[service] + ['config', '--format', 'json']))
        configs[service] = config
        digest = run(originals[service] + ['config', '--hash', service]).split()
        require(digest and digest[-1] == current['Config']['Labels'].get('com.docker.compose.config-hash'), 'Compose inputs differ from the running service')
        image = config['services'][service]['image']
        require(json.loads(run(['docker', 'image', 'inspect', image]))[0]['Id'] == current['Image'], 'Expected image is unavailable or differs')
    require(not WORK.exists(), 'Operation directory already exists without completed marker; inspect first')
    WORK.mkdir(mode=0o700)
    overlay = WORK / 'semantic-enabled.json'
    overlay.write_text(json.dumps({'services': {s: {'environment': {FLAG: 'true'}} for s in SERVICES}}) + '\n')
    candidates = {s: originals[s] + ['-f', str(overlay)] for s in SERVICES}
    for service in SERVICES:
        candidate = json.loads(run(candidates[service] + ['config', '--format', 'json']))
        validate_delta(configs[service], candidate, service)
    record = {'status': 'PREPARED', 'rollback': originals, 'paidRequestsStarted': 0}
    marker.write_text(json.dumps(record, indent=2) + '\n')
    print('Preflight PASS: independent Compose inputs, unchanged images/settings, no queued semantic jobs', flush=True)
    attempted = []
    try:
        check_queues()
        for service in SERVICES:
            require(inspect('beauty-preview-' + service + '-1')['Id'] == before[service]['Id'], 'Concurrent target service change')
            attempted.append(service)
            run(candidates[service] + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service], timeout=100)
            print(service + ' semantic gate enabled with existing image', flush=True)
        wait_ready()
        after = snapshot()
        require(set(before) == set(after), 'Preview service inventory changed')
        for service in SERVICES:
            verify_changed(before[service], after[service], 'true')
        for service in set(before) - set(SERVICES):
            # Health check timestamps can move; identities and process lifetimes cannot.
            require(all(before[service].get(k) == after[service].get(k) for k in ['Id', 'Image', 'RestartCount']) and before[service]['State']['StartedAt'] == after[service]['State']['StartedAt'], 'Unrelated preview service changed')
        record['status'] = 'COMPLETED'
        record['images'] = {s: after[s]['Image'] for s in SERVICES}
        marker.write_text(json.dumps(record, indent=2) + '\n')
        print('Activation PASS: API healthy, worker running, HTTPS readiness/CORS PASS; unrelated containers unchanged')
        print('Existing key bootstrap retained; no key printed, created or replaced')
        print('Paid requests started by this operation: 0; authorized console indexing and one search remain')
        print('Rollback command inputs retained in ' + str(marker))
    except Exception as error:
        print('Acceptance stopped: ' + (str(error) if isinstance(error, Stop) else 'Private diagnostics withheld'), flush=True)
        rollback_ok = True
        for service in reversed(attempted):
            try:
                run(originals[service] + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', service], timeout=100)
                verify_changed(before[service], inspect('beauty-preview-' + service + '-1'), 'false')
            except Exception:
                rollback_ok = False
        try:
            wait_ready()
        except Exception:
            rollback_ok = False
        record['status'] = 'ROLLED_BACK' if rollback_ok else 'ROLLBACK_NEEDS_REVIEW'
        marker.write_text(json.dumps(record, indent=2) + '\n')
        raise Stop('Activation stopped; rollback ' + ('PASS' if rollback_ok else 'NEEDS REVIEW')) from None

def main():
    ROOT.mkdir(exist_ok=True)
    with open(ROOT / 'semantic-matching-approved-20261028.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        activate()

try:
    main()
except Exception as error:
    print(str(error) if isinstance(error, Stop) else 'Operation stopped safely; private diagnostics withheld')
    raise SystemExit(1)
PY
