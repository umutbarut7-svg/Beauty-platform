#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import hashlib,pathlib,subprocess,tempfile,urllib.request
revision='1a508a024e23a3c1e93c54b3d81fda5a655bbb0c'
inputs=[
 ('infra/operations/stage_photo_configuration.py','9a191d97a9816dbc29a1c1d821678844b1a032a4cbecf70e166233737af687d8','stage_photo_configuration.py'),
 ('infra/operations/activate_photo_configuration.py','a46a10e2cfaec9d0b0d818bdc91343c1d04c949fc5a8d5591d682020d852acff','activate_photo_configuration.py'),
 ('infra/operations/photo-policy.pending.override.json','a35bb78bf35fabbe8c48954ae609f5237280632eea729c47f9bc3cd8ad6f1c8b','pending.json'),
]
folder=pathlib.Path(tempfile.mkdtemp(prefix='photo-activation-source-',dir='/opt/epifiz/operations'))
for relative,expected,name in inputs:
    url='https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/'+revision+'/'+relative
    with urllib.request.urlopen(url,timeout=20) as reply:data=reply.read(32769)
    if len(data)>32768 or hashlib.sha256(data).hexdigest()!=expected:raise SystemExit('Pinned activation input differs; nothing applied')
    path=folder/name
    with path.open('xb') as handle:handle.write(data)
    path.chmod(0o600)
result=subprocess.run(['python3',str(folder/'activate_photo_configuration.py'),'--candidate',str(folder/'pending.json'),'--approved-photo-activation'],timeout=720)
if result.returncode:raise SystemExit('Photo activation did not pass; inspect rollback status before retry')
PY
