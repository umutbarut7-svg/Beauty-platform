"""Build reviewed modules in CI; never print source or compiled payload contents."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import urllib.request

BASE_REF = '123e7339e2ab2a9e8e94f391a8431b73afc28efe'
CANDIDATE_REF = '9112386fc2c029cd8a4977be1f8e467f2dab5694'
SOURCES = {
    'visual.service': {'baseline': '132dedf165ab734c5e2bb87528127bc23bd26d46', 'candidate': '95129caac55fb9739cfcbde1e126f4651c346782'},
    'visual.controller': {'baseline': '352c078569e0e11ede62c86b4ac0679e86696377', 'candidate': 'ca0afbacf9603851a947f49c3bc5b5bb8b01bee2'},
}

def verify(data, expected):
    if len(data) > 64000 or hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() != expected:
        raise SystemExit('Reviewed compiler source digest mismatch')

def collect(root):
    result = {}
    for stem in SOURCES:
        data = (root / 'apps/api/dist/mvp' / (stem + '.js')).read_bytes()
        if not 0 < len(data) <= 40000:
            raise SystemExit('Compiled module size outside bounds')
        result[stem] = {'content': data.decode(), 'sha256': hashlib.sha256(data).hexdigest()}
    return result

def main():
    root = pathlib.Path(sys.argv[1]).resolve()
    output = pathlib.Path(sys.argv[2]).resolve()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    if head != CANDIDATE_REF:
        raise SystemExit('Reviewed application checkout mismatch')
    original = {}
    for stem, pins in SOURCES.items():
        original[stem] = (root / 'apps/api/src/mvp' / (stem + '.ts')).read_bytes()
        verify(original[stem], pins['candidate'])
    subprocess.run(['pnpm', '--filter', '@beauty-platform/types', 'build'], cwd=root, check=True, timeout=180)
    subprocess.run(['pnpm', '--filter', '@beauty-platform/api', 'build'], cwd=root, check=True, timeout=180)
    candidate = collect(root)
    try:
        for stem, pins in SOURCES.items():
            url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + BASE_REF + '/apps/api/src/mvp/' + stem + '.ts'
            with urllib.request.urlopen(url, timeout=20) as response:
                data = response.read(64001)
            verify(data, pins['baseline'])
            (root / 'apps/api/src/mvp' / (stem + '.ts')).write_bytes(data)
        subprocess.run(['pnpm', '--filter', '@beauty-platform/api', 'build'], cwd=root, check=True, timeout=180)
        baseline = collect(root)
    finally:
        for stem, data in original.items():
            (root / 'apps/api/src/mvp' / (stem + '.ts')).write_bytes(data)
    data = json.dumps({'baselineRef': BASE_REF, 'candidateRef': CANDIDATE_REF, 'sourceBlobs': SOURCES, 'modules': {'baseline': baseline, 'candidate': candidate}}, ensure_ascii=False, separators=(',', ':')).encode()
    if len(data) > 120000:
        raise SystemExit('Compiled payload exceeds bound')
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(data)
    print('Reviewed full-build module payload prepared; contents are not logged')

if __name__ == '__main__':
    main()
