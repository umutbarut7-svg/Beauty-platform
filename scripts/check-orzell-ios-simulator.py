#!/usr/bin/env python3
"""Install the exact reviewed simulator artifact, cold-launch twice, and capture UI.

No login, live photo, provider call, booking, or physical-device acceptance is run.
"""
import hashlib
import io
import json
import os
import pathlib
import plistlib
import re
import stat
import subprocess
import sys
import time
import zipfile

ARCHIVE_SHA = '561f427eed10a73dbb2abdee042fcd134bfbf1d7b1f06419e4cd530f11571b4f'
PAYLOAD_SHA = '166bdc1a7c037db403e627765f0b4cf3c2143b9aebbf3e64b036d732686cced6'
LOGO_SHA = '16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4'
APPLICATION = '123e7339e2ab2a9e8e94f391a8431b73afc28efe'
HARNESS = '59167b378feb070c79af86dd4decad3580048e9f'
BUNDLE = 'dev.epifiz.preview'


def run(*args, timeout=60):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed: {result.stderr[-1500:]}')
    return result.stdout


def unpack(archive, output):
    raw = pathlib.Path(archive).read_bytes()
    if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA:
        raise ValueError('Reviewed outer artifact checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(raw)) as outer:
        expected = f'Application: {APPLICATION}\nHarness: {HARNESS}\nPlatform: ios\n'
        if outer.read('build-revision.txt').decode() != expected:
            raise ValueError('Reviewed application/build revision mismatch')
        payload = outer.read('ORZELL-ios-simulator.zip')
    if hashlib.sha256(payload).hexdigest() != PAYLOAD_SHA:
        raise ValueError('Reviewed simulator payload checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(payload)) as inner:
        for entry in inner.infolist():
            name = pathlib.PurePosixPath(entry.filename)
            if name.is_absolute() or '..' in name.parts:
                raise ValueError('Unsafe archive path')
            if name.parts[0] == '__MACOSX':
                continue
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError('Unexpected archive symlink')
            target = output.joinpath(*name.parts)
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(inner.read(entry))
                target.chmod(mode & 0o777 or 0o644)
    apps = list(output.glob('*.app'))
    if len(apps) != 1:
        raise ValueError('Expected one simulator application')
    app = apps[0]
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    if (info.get('CFBundleDisplayName') != 'ORZELL'
            or info.get('CFBundleIdentifier') != BUNDLE
            or info.get('CFBundleSupportedPlatforms') != ['iPhoneSimulator']):
        raise ValueError('Unexpected native identity or platform')
    if not (app / 'main.jsbundle').is_file():
        raise ValueError('Self-contained JavaScript missing')
    logos = [p for p in app.rglob('*.jpg') if hashlib.sha256(p.read_bytes()).hexdigest() == LOGO_SHA]
    if len(logos) != 1:
        raise ValueError('Exact original logo missing or duplicated')
    executable = info['CFBundleExecutable']
    if pathlib.Path(executable).name != executable or not (app / executable).is_file():
        raise ValueError('Unexpected executable')
    return app, executable


def main():
    output = pathlib.Path(sys.argv[2]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    app, executable = unpack(sys.argv[1], output / 'unpacked')
    devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
    candidates = [(runtime, d) for runtime, group in devices.items()
                  for d in group if d.get('isAvailable') and d['name'].startswith('iPhone')]
    if not candidates:
        raise RuntimeError('No available iPhone simulator')
    runtime, device = sorted(candidates, key=lambda item: (item[0], item[1]['name']))[-1]
    udid = device['udid']
    if not re.fullmatch(r'[0-9A-Fa-f-]{36}', udid):
        raise ValueError('Invalid simulator identity')
    owned_boot = device['state'] != 'Booted'
    try:
        if owned_boot:
            run('xcrun', 'simctl', 'boot', udid)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b', timeout=240)
        run('xcrun', 'simctl', 'install', udid, str(app), timeout=120)
        for attempt in (1, 2):
            launched = run('xcrun', 'simctl', 'launch', '--terminate-running-process', udid, BUNDLE)
            match = re.search(r': (\d+)\s*$', launched)
            if not match:
                raise RuntimeError('Launch did not return a process identity')
            pid = int(match[1])
            time.sleep(5)
            os.kill(pid, 0)
            command = run('ps', '-p', str(pid), '-o', 'comm=').strip()
            if pathlib.Path(command).name != executable:
                raise RuntimeError('Launched app process no longer running')
            run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / f'ios-launch-{attempt}.png'))
            run('xcrun', 'simctl', 'terminate', udid, BUNDLE)
        evidence = {
            'status': 'PASS', 'scope': 'simulator install and two cold launches only',
            'artifactId': 12528952139, 'sourceRun': 40016474475,
            'application': APPLICATION, 'buildHarness': HARNESS,
            'payloadSha256': PAYLOAD_SHA, 'originalLogoSha256': LOGO_SHA,
            'device': device['name'], 'runtime': runtime,
            'physicalDeviceAcceptance': False, 'authenticatedJourneyTested': False,
            'screenshotsManuallyReviewed': False,
        }
        (output / 'simulator-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
        print('PASS: exact ORZELL artifact installed; both cold launches survived 5 seconds')
        print('Screenshots require separate review; physical device and account/photo journeys remain open')
    finally:
        if owned_boot:
            run('xcrun', 'simctl', 'shutdown', udid)


if __name__ == '__main__':
    main()
