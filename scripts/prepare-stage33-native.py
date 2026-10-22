#!/usr/bin/env python3
"""Reproduce the deployed preview overlays in an isolated native-build checkout."""
import json
import pathlib
import runpy
import sys

application = pathlib.Path(sys.argv[1]).resolve()
harness = pathlib.Path(__file__).resolve().parents[1]
operations = harness / 'infra/operations'
app = application / 'apps/mobile/App.tsx'
runpy.run_path(str(operations / 'preview-auth-ux-overlay.py'))['patch'](app)
mobile = next(edit for edit in runpy.run_path(str(operations / 'preview-booking-context-overlay.py'))['EDITS'] if edit['path'] == 'apps/mobile/App.tsx')
text = app.read_text()
for before, after in mobile['changes']:
    if text.count(before) != 1:
        raise SystemExit('Native booking source drift; preparation blocked')
    text = text.replace(before, after, 1)
app.write_text(text)
for name in ['preview-cancellation-overlay.py', 'preview-business-selection-overlay.py', 'preview-epifiz-brand-overlay.py']:
    runpy.run_path(str(operations / name))['patch'](app)
config = application / 'apps/mobile/app.json'
runpy.run_path(str(operations / 'preview-epifiz-brand-overlay.py'))['patch_config'](config)
data = json.loads(config.read_text())
data['expo'].setdefault('android', {})['package'] = 'dev.epifiz.preview'
data['expo'].setdefault('ios', {})['bundleIdentifier'] = 'dev.epifiz.preview'
config.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print('Pinned preview overlays and isolated native preview identifiers: PASS')
