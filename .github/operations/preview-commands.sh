#!/bin/bash
set -euo pipefail
gateway=beauty-preview-gateway-1
host=preview.13-51-112-228.sslip.io
path=/.well-known/apple-app-site-association
docker inspect --format 'gateway={{.State.Status}} started={{.State.StartedAt}} restarts={{.RestartCount}}' "$gateway"
docker port "$gateway" 443/tcp
curl --silent --show-error --max-time 12 --resolve "$host:443:127.0.0.1" --output /dev/null --write-out 'local_https=%{http_code} tls_verify=%{ssl_verify_result} seconds=%{time_total}\n' "https://$host$path"
docker logs --since 12h "$gateway" 2>&1 | python3 -c '
import collections,json,sys
counts=collections.Counter()
for line in sys.stdin:
    try: event=json.loads(line)
    except ValueError: continue
    if not isinstance(event,dict): continue
    logger=str(event.get("logger",""))
    if logger.startswith("http.log.access"):
        counts["access_events"]+=1
        if event.get("request",{}).get("uri") == "/.well-known/apple-app-site-association": counts["association_requests"]+=1
    if ("tls" in logger or "TLS" in str(event.get("msg",""))) and event.get("level") in ("warn","error"): counts["tls_warnings_or_errors"]+=1
for key in ("access_events","association_requests","tls_warnings_or_errors"): print(key,counts[key])
'
curl --silent --show-error --max-time 25 --dump-header - --output /dev/null "https://app-site-association.cdn-apple.com/a/v1/$host" | awk 'tolower($0) ~ /^(http\/|date:|apple-failure-reason:|apple-failure-details:)/'
