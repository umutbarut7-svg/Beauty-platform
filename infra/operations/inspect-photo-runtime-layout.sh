#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json, subprocess, pathlib
for service in ['api','worker']:
    r=subprocess.run(['docker','inspect','beauty-preview-'+service+'-1'],capture_output=True,text=True,timeout=20)
    if r.returncode: raise SystemExit('Inspection failed')
    v=json.loads(r.stdout)[0]
    labels=v.get('Config',{}).get('Labels',{})
    for name in ['com.docker.compose.project.working_dir','com.docker.compose.project.config_files','com.docker.compose.project.environment_file']:
        value=labels.get(name,'')
        if value and all(part.startswith('/opt/epifiz/') and '\n' not in part for part in value.split(',')):
            print(service+' '+name+'='+value)
        else: print(service+' '+name+'=UNVERIFIED')
    print(service+' running='+str(bool(v['State'].get('Running'))))
    # Print only whether the current process is the expected long-running worker.
    if service=='worker':
        pid=v['State'].get('Pid',0)
        queue=[pid]; seen=set(); found=False
        try:
            while queue and len(seen)<32:
                pid=queue.pop()
                if not pid or pid in seen: continue
                seen.add(pid)
                folder=pathlib.Path('/proc')/str(pid)
                args=(folder/'cmdline').read_bytes().split(b'\0')
                if any(a.endswith(b'dist/worker.js') for a in args) and b'--once' not in args: found=True
                queue.extend(int(x) for x in (folder/'task'/str(pid)/'children').read_text().split())
        except (OSError,ValueError): pass
        print('long_running_worker_observed='+str(found))
print('READ_ONLY; no environment values, keys, photo data or database content emitted')
PY
