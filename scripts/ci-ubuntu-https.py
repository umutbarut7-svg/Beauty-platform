#!/usr/bin/env python3
"""Use HTTPS for existing official Ubuntu mirrors on disposable CI runners."""
from pathlib import Path
import re

FILES = (
    'etc/apt/apt-mirrors.txt',
    'etc/apt/sources.list',
    'etc/apt/sources.list.d/ubuntu.sources',
    'etc/apt/sources.list.d/ubuntu.list',
)
PATTERN = re.compile(r'http://((?:azure\.archive|archive|security)\.ubuntu\.com/ubuntu(?:/|(?=\s|$)))')

def secure_sources(root=Path('/')):
    changed = 0
    for relative in FILES:
        path = root / relative
        if not path.is_file():
            continue
        previous = path.read_text()
        updated = PATTERN.sub(r'https://\1', previous)
        if updated != previous:
            path.write_text(updated)
            changed += 1
    return changed

if __name__ == '__main__':
    print(f'Existing official Ubuntu mirror files secured: {secure_sources()}')
