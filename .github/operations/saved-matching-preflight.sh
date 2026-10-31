#!/bin/bash
set -euo pipefail
python3 - <<'PY'
"""Read-only preflight for reviewed saved-matching release #71."""
import json
import pathlib
import re
import subprocess
import urllib.request

CONTAINERS = {'api': 'beauty-preview-api-1', 'worker': 'beauty-preview-worker-1'}
MODULES = ['mvp.module', 'visual.service', 'visual.controller', 'semantic.service', 'visual-matches.service', 'photo-maintenance.service']
QUOTAS = ['MVP_AI_DAILY_REQUEST_LIMIT', 'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT', 'MVP_SEMANTIC_DAILY_REQUEST_LIMIT', 'MVP_SEMANTIC_GLOBAL_DAILY_REQUEST_LIMIT']

def require(condition):
    if not condition:
        raise RuntimeError('Preflight evidence requires review')

def run(args, limit=500000):
    result = subprocess.run(args, capture_output=True, text=True, timeout=20)
    require(result.returncode == 0 and len(result.stdout) + len(result.stderr) <= limit)
    return result.stdout

def inspect(name):
    info = json.loads(run(['docker', 'inspect', name]))
    require(len(info) == 1)
    return info[0]

def runtime(name):
    # Load only the generated Prisma metadata; never instantiate a database client.
    script = r"""
const fs=require('node:fs'),crypto=require('node:crypto');
const modules=['mvp.module','visual.service','visual.controller','semantic.service','visual-matches.service','photo-maintenance.service'];
const digest=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const client=require('/application/node_modules/@prisma/client');
const model=client.Prisma.dmmf.datamodel.models.find(x=>x.name==='MvpPhotoAnalysis');
console.log(JSON.stringify({modules:Object.fromEntries(modules.map(n=>[n,digest('/application/dist/mvp/'+n+'.js')])),prismaVersion:client.Prisma.prismaVersion.client,matchingFields:model?model.fields.filter(f=>['matchingStatus','matchingRequestId','matchingOutput'].includes(f.name)).map(f=>f.name).sort():[]}));
"""
    result = json.loads(run(['docker', 'exec', name, 'node', '-e', script], 10000))
    require(set(result) == {'modules', 'prismaVersion', 'matchingFields'})
    require(set(result['modules']) == set(MODULES))
    require(all(value is None or re.fullmatch(r'[0-9a-f]{64}', value) for value in result['modules'].values()))
    require(bool(re.fullmatch(r'\d+\.\d+\.\d+', result['prismaVersion'])))
    require(set(result['matchingFields']) <= {'matchingStatus', 'matchingRequestId', 'matchingOutput'})
    return result

def schema():
    query = '''SET statement_timeout=5000; SET lock_timeout=1000; BEGIN READ ONLY;
SELECT json_build_object(
 'matchingColumns', (SELECT COALESCE(json_agg(column_name ORDER BY column_name), '[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name='MvpPhotoAnalysis' AND column_name IN ('matchingStatus','matchingRequestId','matchingOutput')),
 'migrationApplied', EXISTS(SELECT 1 FROM "_prisma_migrations" WHERE migration_name='20261030000000_visual_matching_recovery' AND finished_at IS NOT NULL AND rolled_back_at IS NULL),
 'failedMigrations', (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL)
); COMMIT;'''
    result = json.loads(run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', query], 10000))
    require(set(result) == {'matchingColumns', 'migrationApplied', 'failedMigrations'})
    require(set(result['matchingColumns']) <= {'matchingStatus', 'matchingRequestId', 'matchingOutput'})
    require(isinstance(result['migrationApplied'], bool) and result['failedMigrations'] == 0)
    require(len(result['matchingColumns']) in {0, 3})
    require(result['migrationApplied'] == (len(result['matchingColumns']) == 3))
    return result

def main():
    report = {'releaseSource': '4fdfbe61405633ce85764c0b2a13e157bc9e5833', 'containers': {}}
    for service, name in CONTAINERS.items():
        info = inspect(name)
        require(info['State'].get('Running'))
        if service == 'api':
            require(info['State'].get('Health', {}).get('Status') == 'healthy')
        require(bool(re.fullmatch(r'sha256:[0-9a-f]{64}', info['Image'])))
        labels = info['Config'].get('Labels', {})
        require(labels.get('com.docker.compose.project') == 'beauty-preview')
        require(labels.get('com.docker.compose.service') == service)
        inputs = {}
        for key in ['working_dir', 'config_files', 'environment_file']:
            value = labels.get('com.docker.compose.project.' + key, '')
            require(bool(value) and all(p.startswith('/opt/epifiz/') and '\n' not in p for p in value.split(',')))
            inputs[key] = value
        environment = dict(value.split('=', 1) for value in info['Config'].get('Env', []) if '=' in value)
        quotas = {key: environment.get(key, 'UNSET') for key in QUOTAS}
        require(all(v == 'UNSET' or re.fullmatch(r'\d{1,5}', v) for v in quotas.values()))
        report['containers'][service] = {'image': info['Image'], 'compose': inputs, 'quotas': quotas, 'runtime': runtime(name)}
    report['schema'] = schema()
    marker = pathlib.Path('/opt/epifiz/operations/matching-one-approved-test-20261029/result.json')
    require(marker.is_file() and not marker.is_symlink() and marker.stat().st_size <= 20000)
    state = json.loads(marker.read_text()).get('status')
    require(state == 'RESTORED')
    report['priorPaidWindow'] = state
    origin = 'https://preview.13-51-112-228.sslip.io'
    with urllib.request.urlopen(urllib.request.Request(origin + '/api/health/ready', headers={'Origin': origin}), timeout=5) as response:
        require(response.status == 200 and response.headers.get('Access-Control-Allow-Origin') == origin)
    report['readinessAndCors'] = 'PASS'
    print(json.dumps(report, sort_keys=True, separators=(',', ':')))
    print('READ_ONLY_COMPLETE: no customer rows, provider request, quota/key change, migration, restart or deployment')

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Read-only preflight stopped; private diagnostics withheld')
        raise SystemExit(1)
PY
