#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib,pathlib,subprocess,tempfile,urllib.request
revision='620afc3f579361684b85ff92248a9978ba4c2b07'
items=[
 ('infra/operations/stage_photo_configuration.py','d2bccac307dc6d8ae34bbb1ff95529044f91996c74e7af83a7429c21d7381e27','stage_photo_configuration.py'),
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
