#!/bin/bash
set -euo pipefail
# Deliberately do not print environment variables, Docker configuration or app logs.
date -u
free -h
df -h /
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
