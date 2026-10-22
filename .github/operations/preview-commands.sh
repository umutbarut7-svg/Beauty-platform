#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib,re,json
root=pathlib.Path('/var/lib/amazon/ssm/i-09fe7fdb5f10d63b6/document/orchestration/4fa99e42-d5e3-48d1-b5f3-533a3f74d412')
files=[p for name in ['stdout','stderr'] for p in root.rglob(name) if p.is_file()]
text='\n'.join(p.read_text(errors='replace')[-2000000:] for p in files)
markers={'pnpm_install':'pnpm install --frozen-lockfile','next_version':'Next.js 16','compilation_started':'Creating an optimized production build','compiled':'Compiled successfully','page_data':'Collecting page data','export_image':'exporting to image','heap_oom':'heap out of memory','killed':'Killed','dns_error':'EAI_AGAIN','apt_connection_error':'Could not connect','apt_fetch_error':'Failed to fetch','webpack':'(webpack)'}
print('Retained build log files:',len(files))
print('Full-log phase flags:',json.dumps({k:v in text for k,v in markers.items()}))
allowed={'builder','tls-base','admin-build','admin','internal'}
stages=[]
for stage,step,total in re.findall(r'\[([a-z-]+) ([0-9]+)/([0-9]+)\]',text):
    if stage in allowed:
        entry=[stage,int(step),int(total)]
        if not stages or stages[-1]!=entry: stages.append(entry)
print('Build stages reached:',json.dumps(stages[-12:]))
PY
