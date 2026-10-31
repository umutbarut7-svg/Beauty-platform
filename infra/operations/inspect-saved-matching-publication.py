"""Bounded preparation-failure diagnostics; no service or database writes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path('/opt/epifiz/operations/saved-matching-release-20261031-1')
IMAGES = ['sha256:8d47e73a44a5e2d1ec7df3a54c8feaeb315271c819a8e3217237745d62206225', 'sha256:b597f189cd6807d60bf24a5464b4e98b565c18319e394ef88e40b60bcfce8fca']


def run(args):
    reply = subprocess.run(args, capture_output=True, text=True, timeout=30)
    if reply.returncode or len(reply.stdout) + len(reply.stderr) > 500000:
        raise RuntimeError('Bounded inspection unavailable')
    return reply.stdout


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def main():
    report = {'pythonVersion': '.'.join(map(str, sys.version_info[:3])), 'hashlibFileDigestAvailable': hasattr(hashlib, 'file_digest'), 'files': {}, 'containers': {}, 'loadedImages': {}}
    if ROOT.is_symlink() or not ROOT.is_dir():
        raise RuntimeError('Operation directory unavailable')
    allowed = {'artifact.zip', 'images.tar.gz', 'release.json', 'api-evidence.json', 'worker-evidence.json', 'result.json', 'result.pending', 'api-image.json', 'worker-image.json', 'migrate-image.json'}
    if not {path.name for path in ROOT.iterdir()} <= allowed:
        raise RuntimeError('Unexpected operation inventory')
    for path in ROOT.iterdir():
        if path.is_symlink() or not path.is_file():
            raise RuntimeError('Unexpected operation entry')
        row = {'bytes': path.stat().st_size}
        if path.name in {'artifact.zip', 'images.tar.gz'}:
            if path.stat().st_size > 800000000:
                raise RuntimeError('Operation file exceeded bound')
            row['sha256'] = digest(path)
        report['files'][path.name] = row
    record = json.loads((ROOT / 'result.json').read_text())
    report['operation'] = {key: record.get(key) for key in ['status', 'source', 'image']}
    for service in ['api', 'worker', 'postgres']:
        container = json.loads(run(['docker', 'inspect', 'beauty-preview-' + service + '-1']))[0]
        report['containers'][service] = {'image': container['Image'], 'running': container['State'].get('Running'), 'health': container['State'].get('Health', {}).get('Status'), 'restarts': container['RestartCount']}
    for image in IMAGES:
        reply = subprocess.run(['docker', 'image', 'inspect', '--format', '{{.Id}}', image], capture_output=True, text=True, timeout=10)
        report['loadedImages'][image] = reply.returncode == 0 and reply.stdout.strip() == image
    query = '''SET statement_timeout=5000; BEGIN READ ONLY; SELECT json_build_object('matchingColumns',(SELECT COALESCE(json_agg(column_name ORDER BY column_name),'[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name='MvpPhotoAnalysis' AND column_name IN ('matchingStatus','matchingRequestId','matchingOutput')),'failedMigrations',(SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL)); COMMIT;'''
    report['schema'] = json.loads(run(['docker', 'exec', 'beauty-preview-postgres-1', 'psql', '-XAtq', '-v', 'ON_ERROR_STOP=1', '-U', 'beauty', '-d', 'beauty_preview', '-c', query]))
    print(json.dumps(report, sort_keys=True, separators=(',', ':')))
    print('INSPECTION_COMPLETE: no service change, migration, provider request or customer-row read')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Preparation inspection stopped; private diagnostics withheld')
        raise SystemExit(1)
