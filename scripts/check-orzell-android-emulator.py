#!/usr/bin/env python3
"""Validate an isolated x86_64 build and two emulator cold launches.

No login, provider, photo, booking or physical-device acceptance is performed.
"""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

APPLICATION = '3be316d1b2458c49fde162147244aa8077a1f614'
PACKAGE = 'com.beautyplatform.stage33test'
LOGO_SHA = '16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4'


def run(*args, timeout=60, binary=False):
    result = subprocess.run(args, capture_output=True, text=not binary, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f'{args[0]} failed with exit code {result.returncode}')
    return result.stdout


def verify(apk):
    # The workflow checks out a fixed reviewed source; this is a new x86_64
    # emulator build, NOT the previously packaged ARM phone APK.
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError('Duplicate APK entries')
        if 'assets/index.android.bundle' not in names:
            raise ValueError('Self-contained JavaScript missing')
        architectures = {name.split('/')[1] for name in names if name.startswith('lib/')}
        if architectures != {'x86_64'}:
            raise ValueError('Expected isolated x86_64 emulator build')
        logos = [name for name in names if name.endswith(('.jpg', '.jpeg'))
                 and hashlib.sha256(archive.read(name)).hexdigest() == LOGO_SHA]
        if len(logos) != 1:
            raise ValueError('Exact original logo missing or duplicated')
    sdk = pathlib.Path(os.environ['ANDROID_HOME'])
    tools = sorted(sdk.glob('build-tools/*/aapt2'), key=lambda p: p.parent.name)
    if not tools:
        raise RuntimeError('Android aapt2 unavailable')
    badging = run(str(tools[-1]), 'dump', 'badging', str(apk))
    if not re.search(rf"^package: name='{re.escape(PACKAGE)}'", badging, re.M):
        raise ValueError('Unexpected package identity')
    if "application-label:'ORZELL'" not in badging:
        raise ValueError('Unexpected app display name')
    activity = re.search(r"^launchable-activity: name='([^']+)'", badging, re.M)
    if not activity or not activity[1].startswith(PACKAGE + '.'):
        raise ValueError('Unexpected launch activity')
    return f'{PACKAGE}/{activity[1]}'


def main():
    if os.environ.get('CI') != 'true':
        raise RuntimeError('CI emulator fixture required')
    apk = pathlib.Path(sys.argv[1]).resolve()
    output = pathlib.Path(sys.argv[2]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    component = verify(apk)
    devices = run('adb', 'devices').splitlines()[1:]
    ready = [line.split()[0] for line in devices if line.endswith('\tdevice')]
    if len(ready) != 1 or not re.fullmatch(r'emulator-\d+', ready[0]):
        raise RuntimeError('Exactly one isolated emulator required')
    serial = ready[0]

    def adb(*args, **kwargs):
        return run('adb', '-s', serial, *args, **kwargs)

    def screenshot(name):
        raw = adb('exec-out', 'screencap', '-p', binary=True)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) < 1000:
            raise RuntimeError('Invalid emulator screenshot')
        (output / name).write_bytes(raw)

    observations = []
    try:
        if adb('shell', 'getprop', 'sys.boot_completed').strip() != '1':
            raise RuntimeError('Emulator has not booted')
        if adb('shell', 'getprop', 'ro.product.cpu.abi').strip() != 'x86_64':
            raise RuntimeError('Unexpected emulator architecture')
        adb('install', '--no-streaming', '-r', str(apk), timeout=120)
        adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP')
        adb('shell', 'wm', 'dismiss-keyguard')
        for attempt in (1, 2):
            adb('shell', 'am', 'force-stop', PACKAGE)
            launched = adb('shell', 'am', 'start', '-W', '-n', component, timeout=90)
            if not re.search(r'^Status: ok\s*$', launched, re.M):
                raise RuntimeError('Android launch did not report success')
            pid = adb('shell', 'pidof', PACKAGE).strip()
            if not re.fullmatch(r'\d+', pid):
                raise RuntimeError('App process identity missing')
            time.sleep(5)
            if adb('shell', 'pidof', PACKAGE).strip() != pid:
                raise RuntimeError('App process exited or restarted')
            resumed = adb('shell', 'dumpsys', 'activity', 'activities')
            if not any(PACKAGE in line and 'ResumedActivity' in line for line in resumed.splitlines()):
                raise RuntimeError('App is not the resumed activity')
            adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/orzell-launch.xml', timeout=45)
            xml = adb('exec-out', 'cat', '/sdcard/orzell-launch.xml')
            tree = ET.fromstring(xml)
            labels = ' '.join(node.attrib.get(key, '') for node in tree.iter()
                              for key in ('text', 'content-desc'))
            for expected in ('Giriş yap', 'E-posta', 'Parola'):
                if expected not in labels:
                    raise RuntimeError('Expected Turkish sign-in controls missing')
            screenshot(f'android-launch-{attempt}.png')
            observations.append({'launch': attempt, 'survivedSeconds': 5,
                                 'foregroundVerified': True, 'signInControlsPresent': True})
            adb('shell', 'am', 'force-stop', PACKAGE)
        evidence = {
            'status': 'PASS', 'scope': 'x86_64 emulator installation and two cold launches only',
            'application': APPLICATION, 'harness': os.environ.get('GITHUB_SHA'),
            'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
            'originalLogoSha256': LOGO_SHA, 'package': PACKAGE,
            'androidApi': adb('shell', 'getprop', 'ro.build.version.sdk').strip(),
            'buildType': 'release with test identity; not a store distribution build',
            'architecture': 'x86_64', 'sameAsArmPhoneArtifact': False,
            'observations': observations, 'physicalDeviceAcceptance': False,
            'authenticatedJourneyTested': False, 'photoPermissionsTested': False,
            'screenshotsManuallyReviewed': False,
        }
        (output / 'emulator-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
        print('PASS: ORZELL x86_64 APK installed; both cold launches survived and exposed Turkish sign-in controls')
    except Exception:
        try:
            screenshot('android-launch-failure.png')
        except Exception:
            print('Failure screenshot unavailable', flush=True)
        raise
    finally:
        adb('shell', 'am', 'force-stop', PACKAGE)


if __name__ == '__main__':
    main()
