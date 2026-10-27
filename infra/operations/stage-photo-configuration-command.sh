#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib,pathlib,subprocess,tempfile,urllib.request
revision='3adce2cbd8fe82c9a251da3e88264b89e88c77d9'
items=[
 ('infra/operations/stage_photo_configuration.py','aaec33749644b3a63e9a8371ff3011f8996d7e9deaf6ffc7375f450a0c4e2d52','stage_photo_configuration.py'),
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
