#!/bin/bash
set -euo pipefail
docker logs --since 25m beauty-preview-gateway-1 2>&1 | python3 -c '
import sys,json,re
for l in sys.stdin:
    if "orzell.13-51-112-228.traefik.me" not in l: continue
    try: e=json.loads(l)
    except ValueError: continue
    if e.get("logger","").startswith("http.log.access"): continue
    s=str(e.get("error") or e.get("detail") or e.get("problem",{}))[:550]
    s=re.sub(r"https?://\S+","[URL]",s)
    print(e.get("level"),e.get("logger"),str(e.get("msg",""))[:120],s)
'
for tool in tcpdump nft iptables; do command -v "$tool" || true; done
if command -v iptables >/dev/null; then iptables -S DOCKER-USER 2>/dev/null || true; fi
