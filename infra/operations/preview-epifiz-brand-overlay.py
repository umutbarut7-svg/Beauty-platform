#!/usr/bin/env python3
"""Apply the owner's provisional EPIFIZ product name to the pinned preview."""
import json
import pathlib


def patch(path):
    path = pathlib.Path(path)
    text = path.read_text()
    before = 'BEAUTY PLATFORM · PRE-LAUNCH'
    if text.count(before) != 1:
        raise SystemExit('Brand source drift; patch blocked')
    path.write_text(text.replace(before, 'EPIFIZ · ÖN İZLEME', 1))


def patch_config(path):
    path = pathlib.Path(path)
    data = json.loads(path.read_text())
    if data['expo']['name'] != 'Beauty Platform':
        raise SystemExit('Display name source drift; patch blocked')
    data['expo']['name'] = 'EPIFIZ'
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
