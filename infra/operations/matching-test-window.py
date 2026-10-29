"""One owner-approved matching opportunity, with bounded automatic restoration."""

import copy
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path('/opt/epifiz/operations')
WORK = ROOT / 'matching-one-approved-test-20261029'
RECORD = WORK / 'result.json'
UNIT = 'orzell-matching-window-20261029'
FLAG = 'MVP_AI_DAILY_REQUEST_LIMIT'
BEFORE, COUNTER, AFTER = '5', 7, '8'
SERVICES = ['api', 'worker', 'postgres', 'gateway', 'admin', 'prepare-secrets']


class Stop(Exception):
    pass


def require(ok, message):
    if not ok:
        raise Stop(message)


def run(args, timeout=40):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    require(p.returncode == 0, 'Operation command failed; private output withheld')
    return p.stdout


def sql(query):
    return run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', 'SET statement_timeout=5000; SET lock_timeout=1000; BEGIN READ ONLY; ' + query + '; COMMIT;']).strip()


def inspect(service):
    return json.loads(run(['docker', 'inspect', 'beauty-preview-' + service + '-1']))[0]


def env(container):
    return dict(x.split('=', 1) for x in container['Config'].get('Env', []) if '=' in x)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def compose(container):
    labels = container['Config']['Labels']
    require(labels.get('com.docker.compose.project') == 'beauty-preview', 'Unexpected Compose project')
    working = labels.get('com.docker.compose.project.working_dir', '')
    require(working.startswith('/opt/epifiz/') and pathlib.Path(working).is_dir(), 'Unexpected working directory')
    command = ['docker', 'compose', '-p', 'beauty-preview', '--project-directory', working]
    for name in filter(None, labels.get('com.docker.compose.project.environment_file', '').split(',')):
        require(name.startswith('/opt/epifiz/') and pathlib.Path(name).is_file(), 'Missing original environment input')
        command += ['--env-file', name]
    names = labels.get('com.docker.compose.project.config_files', '').split(',')
    require(all(x.startswith('/opt/epifiz/') and pathlib.Path(x).is_file() for x in names), 'Missing original Compose input')
    for name in names:
        command += ['-f', name]
    return command


def ready():
    for attempt in range(20):
        try:
            current = inspect('api')
            require(current['State'].get('Running') and current['State'].get('Health', {}).get('Status') == 'healthy', 'API is not healthy')
            origin = 'https://preview.13-51-112-228.sslip.io'
            with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=10) as response:
                require(response.status == 200 and response.headers.get('Access-Control-Allow-Origin') == origin, 'API health/CORS failed')
            return
        except Exception:
            if attempt == 19:
                raise Stop('Health deadline reached') from None
            time.sleep(3)


def save(record):
    temporary = WORK / 'result.tmp'
    temporary.write_text(json.dumps(record, indent=2) + '\n')
    temporary.replace(RECORD)


def count(key_hash):
    require(bool(re.fullmatch(r'[0-9a-f]{64}', key_hash)), 'Invalid private bucket selector')
    value = sql('SELECT count FROM "AbuseLimitBucket" WHERE scope=\'AI_USER\' AND "keyHash"=\'' + key_hash + '\' AND "windowStart"=\'2026-10-29T00:00:00Z\'')
    require(value.isdigit(), 'Daily bucket unavailable')
    return int(value)


def validate_candidate(baseline, candidate):
    expected = copy.deepcopy(baseline)
    require(str(expected['services']['api']['environment'][FLAG]) == BEFORE, 'Original configured limit changed')
    expected['services']['api']['environment'][FLAG] = AFTER
    require(expected == candidate, 'Candidate changes more than the daily API limit')


def matching_http_rows(text, start, end):
    text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)
    markers = list(re.finditer(r'[\"\x27]?timestamp[\"\x27]?\s*:\s*[\"\x27]([^\"\x27]+)[\"\x27]', text))
    rows = []
    for index, marker in enumerate(markers):
        block = text[marker.start():min(marker.start() + 2500, markers[index + 1].start() if index + 1 < len(markers) else len(text))]
        def field(name):
            value = re.search(r'[\"\x27]?' + name + r'[\"\x27]?\s*:\s*[\"\x27]([^\"\x27]+)[\"\x27]', block)
            return value.group(1) if value else ''
        timestamp = marker.group(1)
        if not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z', timestamp):
            continue
        try:
            instant = datetime.datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp()
        except ValueError:
            continue
        status = re.search(r'[\"\x27]?statusCode[\"\x27]?\s*:\s*([1-5]\d\d)\b', block)
        route = field('route')
        if start <= instant <= end and field('method') == 'POST' and '/visual/sessions/' in route and route.endswith('/matches') and status:
            rows.append({'timestamp': timestamp, 'method': 'POST', 'route': 'visual/sessions/:sessionId/matches', 'status': int(status.group(1))})
    return rows[-20:]


def preserve_matching_responses(record):
    try:
        start = record['expiresAt'] - 600
        end = time.time()
        since = datetime.datetime.fromtimestamp(start, datetime.timezone.utc).isoformat()
        logs = subprocess.run(['docker', 'logs', '--since', since, '--tail', '2000', 'beauty-preview-api-1'], capture_output=True, text=True, timeout=20)
        require(logs.returncode == 0 and len(logs.stdout) + len(logs.stderr) <= 1000000, 'Bounded response metadata unavailable')
        record['matchingResponses'] = matching_http_rows(logs.stdout + '\n' + logs.stderr, start, end)
        record['matchingResponseCapture'] = 'CAPTURED'
    except Exception:
        record['matchingResponseCapture'] = 'UNAVAILABLE'
    # Persist the allowlisted status metadata before Compose removes the container.
    # A failed diagnostic read must not prevent restoring the original quota.
    save(record)


def verify_runtime(current, record, limit):
    values = env(current)
    require(values.get(FLAG) == limit and current['Image'] == record['image'], 'API quota/image drift')
    values[FLAG] = BEFORE
    require(digest(values) == record['environment'], 'Other API environment changed')
    require(digest(current['HostConfig']) == record['hostConfig'], 'API host settings changed')
    require(digest({k: current['Config'].get(k) for k in ['Cmd', 'Entrypoint', 'User', 'WorkingDir']}) == record['process'], 'API process settings changed')


def restore(reason):
    record = json.loads(RECORD.read_text())
    if record.get('status') == 'RESTORED':
        print('Already restored; no recreation or provider request')
        return
    current = inspect('api')
    if env(current).get(FLAG) == BEFORE:
        verify_runtime(current, record, BEFORE)
    else:
        verify_runtime(current, record, AFTER)
        preserve_matching_responses(record)
        run(record['original'] + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], 100)
        verify_runtime(inspect('api'), record, BEFORE)
    ready()
    record['status'] = 'RESTORED'
    record['restorationReason'] = reason
    record['restoredAt'] = int(time.time())
    save(record)
    print('Original daily limit 5 restored; unchanged image and environment; healthy API/CORS; no provider request')


def open_window():
    require(time.strftime('%Y-%m-%d', time.gmtime()) == '2026-10-29', 'Approved test day changed')
    require(not RECORD.exists(), 'Existing operation must be inspected, not reopened')
    before = {service: inspect(service) for service in SERVICES}
    ready()
    values = env(before['api'])
    require(values.get(FLAG) == BEFORE and values.get('MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT') == '20' and values.get('MVP_SEMANTIC_ENABLED') == 'true', 'Reviewed quota/semantic configuration drift')
    require(sql('SELECT count(*) FROM "BackgroundJob" WHERE type=\'MVP_CATALOG_EMBED_V1\' AND status IN (\'PENDING\',\'RETRYING\',\'PROCESSING\')') == '0', 'Pending indexing jobs require review')
    actors = sql('SELECT DISTINCT "actorId" FROM "SecurityEvent" WHERE "createdAt">=\'2026-10-29T19:08:00Z\' AND "createdAt"<\'2026-10-29T19:11:00Z\' AND type=\'RATE_LIMIT_EXCEEDED\' AND route LIKE \'%/visual/sessions/%/matches\'').splitlines()
    require(len(actors) == 1 and bool(re.fullmatch(r'[a-zA-Z0-9_-]{5,128}', actors[0])), 'One matching actor was not established')
    key_hash = hashlib.sha256(('mvp-external:86400000:' + actors[0]).encode()).hexdigest()
    require(count(key_hash) == COUNTER, 'Approved actor counter changed; do not expand allowance')
    require(sql('SELECT count(*) FROM "AbuseLimitBucket" WHERE scope=\'AI_USER\' AND "windowStart"=\'2026-10-29T00:00:00Z\'') == '1', 'Additional active daily actors require review')
    global_key = hashlib.sha256(b'mvp-external-global').hexdigest()
    used = sql('SELECT count FROM "AbuseLimitBucket" WHERE scope=\'ENDPOINT\' AND "keyHash"=\'' + global_key + '\' AND "windowStart"=\'2026-10-29T00:00:00Z\'')
    require(used.isdigit() and int(used) < 20, 'Global budget is unavailable; it will not be expanded')
    original = compose(before['api'])
    base_config = json.loads(run(original + ['config', '--format', 'json']))
    running_hash = before['api']['Config']['Labels'].get('com.docker.compose.config-hash')
    require(run(original + ['config', '--hash', 'api']).split()[-1] == running_hash, 'Compose input drift')
    image = base_config['services']['api']['image']
    require(json.loads(run(['docker', 'image', 'inspect', image]))[0]['Id'] == before['api']['Image'], 'Original image changed')
    WORK.mkdir(mode=0o700, exist_ok=True)
    overlay = WORK / 'one-test.json'
    overlay.write_text(json.dumps({'services': {'api': {'environment': {FLAG: AFTER}}}}) + '\n')
    candidate = original + ['-f', str(overlay)]
    validate_candidate(base_config, json.loads(run(candidate + ['config', '--format', 'json'])))
    record = {'status': 'PREPARED', 'original': original, 'image': before['api']['Image'], 'environment': digest(values), 'hostConfig': digest(before['api']['HostConfig']), 'process': digest({k: before['api']['Config'].get(k) for k in ['Cmd', 'Entrypoint', 'User', 'WorkingDir']}), 'bucket': key_hash, 'expiresAt': int(time.time()) + 600, 'paidRequestsStarted': 0}
    save(record)
    # A root-owned transient watchdog restores the original inputs after the one
    # available attempt or ten minutes. It never calls a paid provider.
    run(['systemd-run', '--unit=' + UNIT, '--on-active=30s', '--timer-property=AccuracySec=1s', '/usr/bin/python3', str(WORK / 'quota-window.py'), 'watch'])
    try:
        require(inspect('api')['Id'] == before['api']['Id'] and count(key_hash) == COUNTER, 'Concurrent API/counter change')
        run(candidate + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'api'], 100)
        verify_runtime(inspect('api'), record, AFTER)
        ready()
        for service in SERVICES[1:]:
            after = inspect(service)
            require(all(before[service].get(k) == after.get(k) for k in ['Id', 'Image', 'RestartCount']) and before[service]['State']['StartedAt'] == after['State']['StartedAt'], 'Unrelated service changed')
        watchdog = subprocess.run(['systemctl', 'is-active', UNIT + '.timer', UNIT + '.service'], capture_output=True, text=True, timeout=10)
        require('active' in watchdog.stdout.splitlines(), 'Restoration watchdog is not active')
        record['status'] = 'OPEN'
        save(record)
        print('OPEN: exactly one remaining attempt for the observed active daily actor (7 used, temporary cap 8); global cap remains 20')
        print('Automatic restoration after the next attempt or ten minutes; existing key/images unchanged; no indexing/photo/provider request started')
    except Exception:
        restore('activation-failed')
        raise


def watch():
    while True:
        record = json.loads(RECORD.read_text())
        if record.get('status') == 'RESTORED':
            return
        if time.time() >= record['expiresAt'] or count(record['bucket']) >= int(AFTER):
            # Let the authorized in-flight provider request finish before API recreation.
            time.sleep(40)
            with open(ROOT / 'matching-test-window.lock', 'a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                restore('attempt-observed-or-deadline')
            return
        time.sleep(5)


def main():
    os.umask(0o077)
    require(not WORK.is_symlink(), 'Operation path cannot be a symlink')
    mode = sys.argv[1] if len(sys.argv) == 2 else ''
    if mode == 'watch':
        watch()
        return
    with open(ROOT / 'matching-test-window.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if mode == 'open':
            open_window()
        elif mode == 'restore':
            restore('explicit-restoration')
        else:
            raise Stop('Unsupported operation mode')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Operation stopped; private diagnostics withheld')
        raise SystemExit(1)
