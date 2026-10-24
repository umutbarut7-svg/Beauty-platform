#!/usr/bin/env python3
"""Validate emulator cold launches and offline native form interactions.

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

    def hierarchy():
        adb('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/orzell-launch.xml', timeout=45)
        return ET.fromstring(adb('exec-out', 'cat', '/sdcard/orzell-launch.xml'))

    def labels(tree):
        return ' '.join(node.attrib.get(key, '') for node in tree.iter()
                        for key in ('text', 'content-desc'))

    def rectangle(node):
        match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.attrib.get('bounds', ''))
        if not match:
            return None
        return tuple(map(int, match.groups()))

    def scroll_bounds(tree):
        candidates = [rectangle(n) for n in tree.iter() if n.attrib.get('scrollable') == 'true'
                      and n.attrib.get('package') == PACKAGE]
        candidates = [r for r in candidates if r and r[3] > r[1] + 100]
        if not candidates:
            raise RuntimeError('Native app scroll container unavailable')
        return max(candidates, key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))

    def swipe(direction):
        left, top, right, bottom = scroll_bounds(hierarchy())
        x = (left + right) // 2
        upper, lower = top + (bottom - top) // 4, top + (bottom - top) * 3 // 4
        start, end = (lower, upper) if direction == 'up' else (upper, lower)
        adb('shell', 'input', 'swipe', str(x), str(start), str(x), str(end), '350')

    def top_of_form():
        for _ in range(3):
            swipe('down')

    def seek(label, class_name=None):
        # Coordinates are read afresh from the actual native hierarchy. Never
        # guess fixed control positions or tap underneath the navigation bar.
        for attempt in range(7):
            tree = hierarchy()
            _, viewport_top, _, viewport_bottom = scroll_bounds(tree)
            for node in tree.iter():
                if node.attrib.get('package') != PACKAGE:
                    continue
                if class_name and node.attrib.get('class') != class_name:
                    continue
                # Explicit accessibility names distinguish tabs from submit buttons
                # even when their visible child text is identical.
                name = node.attrib.get('content-desc') or node.attrib.get('text')
                if name != label:
                    continue
                r = rectangle(node)
                if not r or node.attrib.get('enabled') != 'true':
                    continue
                x1, y1, x2, y2 = r
                if (x2 > x1 and y2 - y1 >= 30 and y1 >= viewport_top + 20
                        and y2 <= viewport_bottom - 80):
                    return node, ((x1 + x2) // 2, (y1 + y2) // 2)
            if attempt != 6:
                swipe('up')
        raise RuntimeError(f'Native control not reachable: {label}')

    def tap(label, class_name=None):
        node, (x, y) = seek(label, class_name)
        adb('shell', 'input', 'tap', str(x), str(y))
        return node

    def require_label(expected):
        if expected not in labels(hierarchy()):
            raise RuntimeError(f'Native state missing: {expected}')

    def focused_input(label, password=False):
        nodes = [node for node in hierarchy().iter()
                 if node.attrib.get('package') == PACKAGE
                 and node.attrib.get('class') == 'android.widget.EditText'
                 and node.attrib.get('content-desc') == label
                 and node.attrib.get('focused') == 'true']
        if len(nodes) != 1 or (password and nodes[0].attrib.get('password') != 'true'):
            raise RuntimeError('Expected native input did not actually receive focus')
        return nodes[0]

    def keyboard_shown():
        state = adb('shell', 'dumpsys', 'input_method')
        match = re.search(r'\bmInputShown=(true|false)\b', state)
        if not match:
            raise RuntimeError('Keyboard visibility state unavailable')
        return match[1] == 'true'

    observations = []
    stage = 'installation'
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
            screen_labels = labels(hierarchy())
            for expected in ('Giriş yap', 'E-posta', 'Parola'):
                if expected not in screen_labels:
                    raise RuntimeError('Expected Turkish sign-in controls missing')
            screenshot(f'android-launch-{attempt}.png')
            observations.append({'launch': attempt, 'survivedSeconds': 5,
                                 'foregroundVerified': True, 'signInControlsPresent': True})
            adb('shell', 'am', 'force-stop', PACKAGE)
        stage = 'registration-tab'
        if os.environ.get('EXPO_PUBLIC_API_URL') != 'https://127.0.0.1:9/api':
            raise RuntimeError('Offline-only form fixture endpoint required')
        adb('shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1')
        adb('shell', 'am', 'start', '-W', '-n', component, timeout=90)
        tap('Hesap oluştur ekranı')
        require_label("ORZELL'e hoş geldin")
        stage = 'empty-registration-validation'
        tap('Hesap oluştur')
        seek('Geçerli bir e-posta adresi girin.')
        screenshot('android-launch-empty-validation.png')
        stage = 'email-keyboard'
        top_of_form()
        tap('E-posta', 'android.widget.EditText')
        time.sleep(1)
        focused_input('E-posta')
        if not keyboard_shown():
            raise RuntimeError('Email focus did not show the software keyboard')
        adb('shell', 'input', 'text', 'native-ui@example.test')
        if focused_input('E-posta').attrib.get('text') != 'native-ui@example.test':
            raise RuntimeError('Synthetic email entry did not reach the actual field')
        screenshot('android-launch-email-keyboard.png')
        stage = 'password-keyboard'
        node = tap('Parola', 'android.widget.EditText')
        if node.attrib.get('password') != 'true':
            raise RuntimeError('Native password input is not masked')
        focused_input('Parola', password=True)
        adb('shell', 'input', 'text', 'short')
        entered = focused_input('Parola', password=True).attrib.get('text', '')
        if len(entered) != 5:
            raise RuntimeError('Synthetic short password did not reach the actual field')
        if not keyboard_shown():
            raise RuntimeError('Password input lost the software keyboard')
        screenshot('android-launch-password-keyboard.png')
        stage = 'short-password-validation'
        tap('Hesap oluştur')
        seek('Hesap oluşturmak için şifreniz en az 12 karakter olmalı.')
        if keyboard_shown():
            adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
            time.sleep(1)
        if keyboard_shown():
            raise RuntimeError('Back did not dismiss the software keyboard')
        screenshot('android-launch-short-password.png')
        stage = 'return-to-login'
        top_of_form()
        tap('Giriş yap ekranı')
        require_label('Yeniden merhaba')
        seek('Giriş yap')
        if 'Hesap oluşturmak için şifreniz en az 12 karakter olmalı.' in labels(hierarchy()):
            raise RuntimeError('Registration error leaked into the login tab')
        screenshot('android-launch-return-login.png')
        evidence = {
            'status': 'PASS', 'scope': 'emulator cold launches and offline form interactions',
            'application': APPLICATION, 'harness': os.environ.get('GITHUB_SHA'),
            'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
            'originalLogoSha256': LOGO_SHA, 'package': PACKAGE,
            'androidApi': adb('shell', 'getprop', 'ro.build.version.sdk').strip(),
            'buildType': 'release with test identity; not a store distribution build',
            'architecture': 'x86_64', 'sameAsArmPhoneArtifact': False,
            'observations': observations,
            'offlineApiBaseUrl': 'https://127.0.0.1:9/api',
            'nativeFormInteractionTested': True,
            'registrationTabTested': True, 'emptyEmailRejected': True,
            'shortRegistrationPasswordRejected': True,
            'emailAndPasswordKeyboardVerified': True, 'nativePasswordMasked': True,
            'emailAndPasswordEntryVerified': True,
            'submitReachableWhileKeyboardOpen': True, 'keyboardDismissalTested': True,
            'returnToLoginClearsError': True,
            'physicalDeviceAcceptance': False,
            'authenticatedJourneyTested': False, 'photoPermissionsTested': False,
            'screenshotsManuallyReviewed': False,
        }
        (output / 'emulator-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
        print('PASS: ORZELL installed; cold launches, native tabs, scrolling, masked password, software keyboard and local validation passed')
    except Exception:
        print(f'FAIL stage: {stage}', flush=True)
        try:
            screenshot('android-launch-failure.png')
        except Exception:
            print('Failure screenshot unavailable', flush=True)
        raise
    finally:
        adb('shell', 'am', 'force-stop', PACKAGE)


if __name__ == '__main__':
    main()
