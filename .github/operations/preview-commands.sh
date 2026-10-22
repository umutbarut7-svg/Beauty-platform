#!/bin/bash
set -euo pipefail
python3 - <<'PY'
from pathlib import Path
s=Path('/opt/epifiz/operations/booking-context-20261022/build.log').read_text(errors='replace')
markers=['Cannot find module','typescript','reflect-metadata','ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX','SyntaxError','AssertionError','Expected existing CommonJS','Changed-module compilation diagnostic','ownerCustomer','Unexpected token','ReferenceError','TypeError','ERR_MODULE_NOT_FOUND','ENOENT','Cannot use import statement','exports is not defined','require is not defined']
for m in markers:
 print('Build diagnostic '+m+': '+str(m in s))
PY
