#!/bin/bash
set -euo pipefail
gateway=beauty-preview-gateway-1
host=preview.13-51-112-228.sslip.io
curl --silent --show-error --max-time 25 --dump-header - --output /dev/null "https://app-site-association.cdn-apple.com/a/v1/$host" | awk 'tolower($0) ~ /^(http\/|date:|age:|apple-failure-reason:)/'
docker logs --since 2026-11-20T07:31:08Z "$gateway" 2>&1 | python3 -c '
import json,sys,datetime
count=0
last=None
for line in sys.stdin:
    try: e=json.loads(line)
    except ValueError: continue
    if isinstance(e,dict) and e.get("logger")=="http.log.access.apple_probe":
        count+=1
        last=(datetime.datetime.fromtimestamp(e["ts"],datetime.timezone.utc).isoformat(),e.get("status"))
print("Association requests after deployment self-test:",count,"latest:",last)
'
