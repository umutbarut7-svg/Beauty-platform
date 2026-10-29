"""Prepare one approved attempt and observe its persisted status, without AI calls."""
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

REV = 'febec24635793d94dc808fcaaf7a527f778d5751'
DIGEST = 'a29427ab14eb4e93362618e4359241d7cbf16be1706c643642613c3592df5190'
ROOT = pathlib.Path('/opt/epifiz/operations')
WORK = ROOT / 'matching-one-approved-test-20261029-second'
PREVIOUS = ROOT / 'matching-one-approved-test-20261029/result.json'


class Stop(Exception):
    pass


def require(ok, message):
    if not ok:
        raise Stop(message)


def materialize(source, used):
    require(type(used) is int and 5 <= used < 20, 'Current usage cannot permit one bounded attempt')
    replacements = {
        "WORK = ROOT / 'matching-one-approved-test-20261029'": "WORK = ROOT / 'matching-one-approved-test-20261029-second'",
        "UNIT = 'orzell-matching-window-20261029'": "UNIT = 'orzell-matching-window-20261029-second'",
        "BEFORE, COUNTER, AFTER = '5', 7, '8'": "BEFORE, COUNTER, AFTER = '5', " + str(used) + ", '" + str(used + 1) + "'",
        "print('OPEN: exactly one remaining attempt for the observed active daily actor (7 used, temporary cap 8); global cap remains 20')": "print('OPEN: exactly one remaining attempt for the observed active daily actor (' + str(COUNTER) + ' used, temporary cap ' + AFTER + '); global cap remains 20')",
    }
    for before, after in replacements.items():
        require(source.count(before) == 1, 'Reviewed source boundary changed')
        source = source.replace(before, after)
    compile(source, 'quota-window.py', 'exec')
    return source


def reviewed_source():
    url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/' + REV + '/infra/operations/matching-test-window.py'
    with urllib.request.urlopen(url, timeout=20) as response:
        data = response.read(18001)
    require(len(data) <= 18000 and hashlib.sha256(data).hexdigest() == DIGEST, 'Pinned reviewed helper unavailable')
    return data.decode('utf-8')


def open_window():
    require(time.strftime('%Y-%m-%d', time.gmtime()) == '2026-10-29', 'Approved test day changed')
    require(not WORK.is_symlink() and not (WORK / 'result.json').exists(), 'Existing opportunity cannot be reopened')
    require(PREVIOUS.is_file() and not PREVIOUS.is_symlink() and json.loads(PREVIOUS.read_text()).get('status') == 'RESTORED', 'Previous opportunity is not confirmed restored')
    source = reviewed_source()
    module = {'__name__': 'reviewed_matching_window'}
    exec(compile(source, 'reviewed_matching_window.py', 'exec'), module)
    actors = module['sql']('SELECT DISTINCT "actorId" FROM "SecurityEvent" WHERE "createdAt">=\'2026-10-29T19:08:00Z\' AND "createdAt"<\'2026-10-29T19:11:00Z\' AND type=\'RATE_LIMIT_EXCEEDED\' AND route LIKE \'%/visual/sessions/%/matches\'').splitlines()
    require(len(actors) == 1 and bool(re.fullmatch(r'[a-zA-Z0-9_-]{5,128}', actors[0])), 'One approved matching actor was not established')
    bucket = hashlib.sha256(('mvp-external:86400000:' + actors[0]).encode()).hexdigest()
    used = module['count'](bucket)
    candidate = materialize(source, used)
    WORK.mkdir(mode=0o700, exist_ok=True)
    target = WORK / 'quota-window.py'
    require(not target.is_symlink(), 'Operation file cannot be a symlink')
    target.write_text(candidate)
    # The pinned helper rechecks the actor/counter, global cap 20, empty index
    # queues, exact original runtime/Compose configuration and healthy API.
    # Its watchdog persists the response status before restoring the limit 5.
    result = subprocess.run(['python3', str(target), 'open'], timeout=240)
    require(result.returncode == 0, 'Bounded opportunity did not open; inspect before any retry')


def public_result(record):
    status = record.get('status')
    require(status == 'RESTORED', 'Opportunity has not restored its original limit')
    rows = []
    for row in record.get('matchingResponses', [])[-20:]:
        if (isinstance(row, dict) and row.get('method') == 'POST'
                and row.get('route') == 'visual/sessions/:sessionId/matches'
                and type(row.get('status')) is int and 100 <= row['status'] <= 599
                and isinstance(row.get('timestamp'), str)
                and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z', row['timestamp'])):
            rows.append({key: row[key] for key in ['timestamp', 'method', 'route', 'status']})
    result = {'status': 'RESTORED', 'responses': rows}
    capture = record.get('matchingResponseCapture')
    if capture in {'CAPTURED', 'UNAVAILABLE'}:
        result['responseCapture'] = capture
    return result


def observe():
    marker = WORK / 'result.json'
    require(marker.is_file() and not marker.is_symlink(), 'Approved opportunity record unavailable')
    for attempt in range(150):
        record = json.loads(marker.read_text())
        if record.get('status') == 'RESTORED':
            print('CONTROLLED_MATCHING_RESULT ' + json.dumps(public_result(record), separators=(',', ':')))
            return
        require(record.get('status') in {'PREPARED', 'OPEN'}, 'Operation state requires review')
        time.sleep(5)
    raise Stop('Observation deadline reached; inspect before any new opportunity')


def main():
    os.umask(0o077)
    require(not WORK.is_symlink(), 'Operation directory cannot be a symlink')
    mode = sys.argv[1] if len(sys.argv) == 2 else ''
    if mode == 'open':
        open_window()
    elif mode == 'observe':
        observe()
    else:
        raise Stop('Unsupported operation mode')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Controlled matching inspection stopped; private diagnostics withheld')
        raise SystemExit(1)
