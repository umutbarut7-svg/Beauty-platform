#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import pathlib
events=pathlib.Path('/sys/fs/cgroup/memory.events')
if events.exists():
    print('Host cgroup memory event counters:', events.read_text())
PY
vmstat 1 3
docker image ls --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}'
