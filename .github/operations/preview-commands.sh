#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib,pathlib,subprocess,tempfile,urllib.request
revision='355a34a5e5bf201fca3c6c89d1ccef58d7f1d0c7'
items=[
 ('infra/operations/stage_photo_configuration.py','974e08b91c26c8995491113bc63b63bfbc61bf968aba750c82d064324580e3c2','stage_photo_configuration.py'),
 ('infra/operations/photo-policy.pending.override.json','a35bb78bf35fabbe8c48954ae609f5237280632eea729c47f9bc3cd8ad6f1c8b','pending.json'),
]
folder=pathlib.Path(tempfile.mkdtemp(prefix='photo-stage-source-',dir='/opt/epifiz/operations'))
for relative,expected,name in items:
    url='https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/'+revision+'/'+relative
    with urllib.request.urlopen(url,timeout=20) as reply:
        data=reply.read(32769)
    if len(data)>32768 or hashlib.sha256(data).hexdigest()!=expected:
        raise SystemExit('Pinned staging input differs; nothing applied')
    path=folder/name
    with path.open('xb') as handle:
        handle.write(data)
    path.chmod(0o600)
result=subprocess.run(['python3',str(folder/'stage_photo_configuration.py'),'--candidate',str(folder/'pending.json'),'--approved-staging'],timeout=720)
if result.returncode:
    raise SystemExit('Photo notice staging did not pass; read rollback status before any retry')
PY
