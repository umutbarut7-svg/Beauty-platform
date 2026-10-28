#!/usr/bin/env python3
"""Run a native simulator probe against a loopback-only synthetic HTTP server."""
import email.policy
import email.parser
import http.server
import json
import pathlib
import plistlib
import random
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zlib

ROOT = pathlib.Path(sys.argv[2]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
REPORT = ROOT / 'native-photo-runtime.json'
MARKER = b'SYNTHETIC_PRIVATE_GPS_MARKER'
UPLOADS = []
ERRORS = []


def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))


pixels = bytearray(random.Random(33).randbytes((2560 * 3 + 1) * 1920))
for row in range(1920):
    pixels[row * (2560 * 3 + 1)] = 0
FIXTURE = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2560, 1920, 8, 2, 0, 0, 0))
           + chunk(b'tEXt', b'Comment\0' + MARKER) + chunk(b'IDAT', zlib.compress(pixels, 0)) + chunk(b'IEND', b''))
assert 5 * 1024 * 1024 < len(FIXTURE) < 40 * 1024 * 1024
del pixels


class Server(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, value, status=200, mime='application/json'):
        body = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/fixture.png':
            self.respond(FIXTURE, mime='image/png')
        else:
            self.respond({'status': 'NOT_FOUND'}, 404)

    def do_POST(self):
        validation = 'content length'
        facts = {}
        try:
            length = int(self.headers.get('Content-Length', '0'))
            facts['contentLength'] = length
            facts['transferEncoding'] = self.headers.get('Transfer-Encoding')
            assert 0 < length < 6 * 1024 * 1024
            body = self.rfile.read(length)
            if self.path == '/auth/login':
                assert json.loads(body) == {'email': 'synthetic@example.test', 'password': 'synthetic-native-password'}
                self.respond({'accessToken': 'synthetic-native-token', 'refreshToken': 'synthetic-refresh', 'user': {'id': 'synthetic-native', 'role': 'CUSTOMER'}})
            elif self.path == '/upload':
                validation = 'authorization'
                assert self.headers.get('Authorization') == 'Bearer synthetic-native-token'
                validation = 'multipart parse'
                message = email.parser.BytesParser(policy=email.policy.default).parsebytes(
                    ('Content-Type: ' + self.headers['Content-Type'] + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + body)
                parts = list(message.iter_parts())
                facts['parts'] = len(parts)
                assert len(parts) == 1
                part = parts[0]
                validation = 'part name'
                assert part.get_param('name', header='content-disposition') == 'photo'
                validation = 'JPEG MIME'
                facts['mime'] = part.get_content_type()
                assert part.get_content_type() == 'image/jpeg'
                validation = 'JPEG filename'
                facts['jpegFilename'] = bool(part.get_filename() and part.get_filename().lower().endswith('.jpg'))
                assert part.get_filename().lower().endswith('.jpg')
                jpeg = part.get_payload(decode=True)
                validation = 'JPEG byte signature and size'
                facts['jpegBytes'] = len(jpeg)
                assert jpeg.startswith(b'\xff\xd8\xff') and 0 < len(jpeg) <= 5 * 1024 * 1024
                (ROOT / 'synthetic-upload.jpg').write_bytes(jpeg)
                validation = 'source metadata removal'
                facts['sourceMarkerPresent'] = MARKER in jpeg
                facts['exifPresent'] = b'Exif\x00\x00' in jpeg
                assert MARKER not in jpeg and b'Exif\x00\x00' not in jpeg
                validation = 'decoded JPEG dimensions'
                with tempfile.TemporaryDirectory() as temp:
                    path = pathlib.Path(temp) / 'prepared.jpg'
                    path.write_bytes(jpeg)
                    check = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', str(path)], check=True, text=True, capture_output=True).stdout
                    assert 'pixelWidth: 1600' in check and 'pixelHeight: 1200' in check
                UPLOADS.append({'mime': 'image/jpeg', 'width': 1600, 'height': 1200, 'metadataRemoved': True})
                self.respond({'status': 'VALIDATED'})
            elif self.path == '/result':
                result = json.loads(body)
                result['uploads'] = UPLOADS
                result['serverErrors'] = ERRORS
                REPORT.write_text(json.dumps(result, indent=2) + '\n')
                self.respond({'status': 'RECORDED'})
            else:
                self.respond({'status': 'NOT_FOUND'}, 404)
        except Exception as error:
            ERRORS.append({'type': type(error).__name__, 'validation': validation, 'facts': facts})
            self.respond({'status': 'REJECTED'}, 400)


def run(*args, timeout=120):
    return subprocess.run(args, check=True, text=True, capture_output=True, timeout=timeout).stdout


devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
candidates = [(runtime, device) for runtime, group in devices.items() for device in group
              if device.get('isAvailable') and device['name'].startswith('iPhone')]
assert candidates
candidates.sort(key=lambda item: (item[0], item[1]['name']), reverse=True)
preferred = ('iPhone 16e', 'iPhone 16', 'iPhone 17', 'iPhone 17 Pro')
runtime, device = next((item for name in preferred for item in candidates if item[1]['name'] == name), candidates[0])
udid = device['udid']
owned_boot = device['state'] != 'Booted'
warm = ROOT / 'simulator-selection.json'
if sys.argv[1] == '--warm':
    if device['state'] == 'Shutdown':
        run('xcrun', 'simctl', 'boot', udid)
    run('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid)
    warm.write_text(json.dumps({'udid': udid, 'ownedBoot': owned_boot}) + '\n')
    print('Warming preferred simulator during compilation: ' + device['name'] + ' / ' + runtime, flush=True)
    sys.exit(0)
if warm.exists():
    selection = json.loads(warm.read_text())
    runtime, device = next(item for item in candidates if item[1]['udid'] == selection['udid'])
    udid = device['udid']
    owned_boot = selection['ownedBoot']
print('Runtime probe simulator: ' + device['name'] + ' / ' + runtime, flush=True)
app_info = plistlib.loads((pathlib.Path(sys.argv[1]) / 'Info.plist').read_bytes())
assert app_info['CFBundleIdentifier'] == 'com.beautyplatform.stage33test'
assert app_info['NSAppTransportSecurity']['NSAllowsArbitraryLoads'] is True
server = http.server.ThreadingHTTPServer(('127.0.0.1', 18733), Server)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    if device['state'] == 'Shutdown':
        run('xcrun', 'simctl', 'boot', udid)
    run('open', '-a', 'Simulator', '--args', '-CurrentDeviceUDID', udid)
    subprocess.run(['xcrun', 'simctl', 'bootstatus', udid, '-b'], check=True, timeout=360)
    run('xcrun', 'simctl', 'install', udid, sys.argv[1])
    run('xcrun', 'simctl', 'launch', '--stdout=' + str(ROOT / 'probe-stdout.log'), '--stderr=' + str(ROOT / 'probe-stderr.log'), '--terminate-running-process', udid, 'com.beautyplatform.stage33test')
    for _ in range(90):
        if REPORT.exists():
            break
        time.sleep(2)
    if not REPORT.exists():
        for name in ['probe-stdout.log', 'probe-stderr.log']:
            log = ROOT / name
            if log.exists():
                print(name + ':\n' + log.read_text(errors='replace')[-6000:], flush=True)
        raise AssertionError('Native photo probe did not report completion')
    result = json.loads(REPORT.read_text())
    result.update({'simulator': device['name'], 'runtime': runtime, 'physicalDeviceAcceptance': False})
    REPORT.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)
    assert result['status'] == 'PASS' and len(UPLOADS) == 1 and not ERRORS
    print('PASS: actual native read, JPEG normalization, Expo multipart HTTP upload, authorization and cache cleanup', flush=True)
finally:
    server.shutdown()
    if owned_boot:
        run('xcrun', 'simctl', 'shutdown', udid)
