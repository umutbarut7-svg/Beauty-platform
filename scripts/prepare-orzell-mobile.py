#!/usr/bin/env python3
"""Prepare an isolated ORZELL header after the pinned native preview overlays."""
import hashlib
import json
import pathlib
import sys


def prepare(application, harness=None):
    harness = harness or pathlib.Path(__file__).resolve().parents[1]
    application = pathlib.Path(application).resolve()
    mobile = application / 'apps/mobile'
    app = mobile / 'App.tsx'
    config = mobile / 'app.json'
    manifest = json.loads((harness / 'config/brand/orzell.json').read_text())
    canonical = manifest['identity']['canonicalLogo']
    original = (harness / canonical['file']).read_bytes()
    if hashlib.sha256(original).hexdigest() != canonical['sha256']:
        raise ValueError('Original logo checksum mismatch; preparation blocked')
    component = (harness / 'assets/brand/orzell/OrzellBrand.tsx').read_text()
    text = app.read_text()
    marker = '<Text style={styles.eyebrow}>EPIFIZ · ÖN İZLEME</Text>'
    if text.count(marker) != 1 or './OrzellBrand' in text:
        raise ValueError('Preview header source drift; preparation blocked')
    data = json.loads(config.read_text())
    if data['expo']['name'] != 'EPIFIZ':
        raise ValueError('Preview display name drift; preparation blocked')
    # Validate all inputs before writing; preserve identifiers and all runtime flags.
    text = 'import { OrzellBrand } from "./OrzellBrand";\n' + text.replace(marker, '<OrzellBrand />', 1)
    data['expo']['name'] = 'ORZELL'
    (mobile / 'assets').mkdir(exist_ok=True)
    (mobile / 'assets/orzell-original-reference.jpg').write_bytes(original)
    (mobile / 'OrzellBrand.tsx').write_text(component)
    app.write_text(text)
    config.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    prepare(sys.argv[1])
    print('ORZELL isolated mobile header prepared; no deployment or native icon change')
