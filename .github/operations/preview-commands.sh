#!/bin/bash
set -euo pipefail
date -u
free -h
df -h /
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker image inspect epifiz-admin:webpack-test --format '{{.Id}} {{.Created}}' 2>/dev/null || true
ps -eo pid,comm,pcpu,pmem --sort=-pcpu | head -10
