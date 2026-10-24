#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess,json,pathlib,urllib.request
def run(args):
 p=subprocess.run(args,capture_output=True,text=True,timeout=20)
 if p.returncode:raise SystemExit('Inspection failed: '+args[0])
 return p.stdout.strip()
for service in ['gateway','api','worker','postgres','prepare-secrets','admin']:
 value=json.loads(run(['docker','inspect','beauty-preview-'+service+'-1']))[0]
 print(service+' image: '+value['Image'])
 print(service+' state: '+str(value['State']['Running'])+' OOM: '+str(value['State'].get('OOMKilled',False)))
 if service=='gateway':
  labels=value['Config'].get('Labels',{})
  print('Compose config paths: '+labels.get('com.docker.compose.project.config_files',''))
  print('Compose env path: '+labels.get('com.docker.compose.project.environment_file',''))
for folder in sorted(pathlib.Path('/opt/epifiz/operations').iterdir()):
 if folder.is_dir(): print('Operation directory: '+folder.name)
print('Inspection complete; no mutations')
PY
