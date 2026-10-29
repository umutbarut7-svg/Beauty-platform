#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib
import json
import re
import pathlib
import subprocess

START = '2026-10-29T19:27:00Z'
END = '2026-10-29T19:31:00Z'
ANSI = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')

def run(args, limit=1200000):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    if result.returncode or len(result.stdout) + len(result.stderr) > limit:
        raise RuntimeError('Bounded diagnostic command unavailable')
    return result.stdout

def http_rows(text):
    text = ANSI.sub('', text)
    # Nest's default logger prints objects across multiple lines. Only explicitly
    # selected HTTP metadata is emitted; raw objects, identities and bodies stay private.
    pattern = r'[\"\x27]?timestamp[\"\x27]?\s*:\s*[\"\x27]([^\"\x27]+)[\"\x27]'
    markers = list(re.finditer(pattern, text))
    rows = []
    for index, marker in enumerate(markers):
        block = text[marker.start(): min(marker.start()+2500, markers[index+1].start() if index+1 < len(markers) else len(text))]
        def field(name):
            found = re.search(r'[\"\x27]?' + name + r'[\"\x27]?\s*:\s*[\"\x27]([^\"\x27]+)[\"\x27]', block)
            return found.group(1) if found else ''
        route, method = field('route'), field('method')
        status = re.search(r'[\"\x27]?statusCode[\"\x27]?\s*:\s*(\d{3})\b', block)
        timestamp = marker.group(1)
        if (re.fullmatch(r'2026-10-29T19:(?:27|28|29|30):[0-5]\d(?:\.\d{1,6})?Z', timestamp)
                and route.endswith('/matches') and '/visual/sessions/' in route
                and method == 'POST' and status):
            rows.append({'timestamp': timestamp, 'method': 'POST', 'route': 'visual/sessions/:sessionId/matches', 'status': int(status.group(1))})
    return rows

def sql(query):
    return run(['docker','exec','beauty-preview-postgres-1','psql','-XAtq','-v','ON_ERROR_STOP=1','-U','beauty','-d','beauty_preview','-c',
        'SET statement_timeout=5000; SET lock_timeout=1000; BEGIN READ ONLY; '+query+'; COMMIT;'], 10000)

def main():
    info = json.loads(run(['docker','inspect','beauty-preview-api-1'], 300000))[0]
    if not info['State'].get('Running'):
        raise RuntimeError('Preview API not running')
    print('Preview API running; bounded read-only matching inspection')
    print('Window: '+START+' to '+END)
    env = dict(value.split('=',1) for value in info.get('Config',{}).get('Env',[]) if '=' in value)
    for name in ['MVP_AI_DAILY_REQUEST_LIMIT','MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT','MVP_SEMANTIC_DAILY_REQUEST_LIMIT','MVP_SEMANTIC_GLOBAL_DAILY_REQUEST_LIMIT']:
        value = env.get(name,'')
        print(name+': '+(value if re.fullmatch(r'\d{1,5}',value) else 'UNSET'))
    logs = subprocess.run(['docker','logs','--since',START,'--until',END,'--tail','12000','beauty-preview-api-1'], capture_output=True, text=True, timeout=20)
    if logs.returncode or len(logs.stdout)+len(logs.stderr)>1200000:
        raise RuntimeError('Bounded API log read unavailable')
    rows = http_rows(logs.stdout+'\n'+logs.stderr)
    print('Matching HTTP metadata: '+json.dumps(rows, separators=(',',':')))
    query = '''SELECT CASE WHEN type IN ('AUTHENTICATION_FAILED','AUTHORIZATION_DENIED','RATE_LIMIT_EXCEEDED') THEN type ELSE 'OTHER' END, count(*)
        FROM "SecurityEvent" WHERE "createdAt">='2026-10-29T19:27:00Z' AND "createdAt"<'2026-10-29T19:31:00Z'
        AND route LIKE '%/visual/sessions/%/matches' GROUP BY 1 ORDER BY 1'''
    events = []
    for line in sql(query).splitlines():
        if re.fullmatch(r'(?:AUTHENTICATION_FAILED|AUTHORIZATION_DENIED|RATE_LIMIT_EXCEEDED|OTHER)\|\d+',line):
            kind,count=line.split('|')
            events.append({'type':kind,'count':int(count)})
    print('Matching security counts: '+json.dumps(events,separators=(',',':')))
    global_key=hashlib.sha256(b'mvp-external-global').hexdigest()
    query = '''SELECT count(*), COALESCE(max(count),0) FROM "AbuseLimitBucket"
        WHERE scope='ENDPOINT' AND "keyHash"='%s' AND "windowStart"='2026-10-29T00:00:00Z' ''' % global_key
    value=sql(query).strip()
    if not re.fullmatch(r'\d+\|\d+',value):
        raise RuntimeError('Unexpected aggregate result')
    print('Global daily bucket count|max consumption: '+value)
    query = '''SELECT count(*), COALESCE(max(count),0) FROM "AbuseLimitBucket"
        WHERE scope='AI_USER' AND "windowStart"='2026-10-29T00:00:00Z' '''
    value=sql(query).strip()
    if not re.fullmatch(r'\d+\|\d+',value):
        raise RuntimeError('Unexpected aggregate result')
    print('Daily user buckets count|max consumption: '+value)
    record_path = pathlib.Path('/opt/epifiz/operations/matching-one-approved-test-20261029/result.json')
    if record_path.is_file() and not record_path.is_symlink():
        record = json.loads(record_path.read_text())
        status = record.get('status')
        print('Approved window status: '+(status if status in {'PREPARED', 'OPEN', 'RESTORED'} else 'UNKNOWN'))
        for name in ['expiresAt', 'restoredAt']:
            value=record.get(name)
            if isinstance(value,int):
                print('Approved window '+name+': '+str(value))
    print('READ-ONLY COMPLETE: no provider request, photo/session content, key access, quota change, write, restart or deployment')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Bounded inspection stopped; private diagnostics withheld')
        raise SystemExit(1)
PY
