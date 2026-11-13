#!/usr/bin/env python3
"""Explicit exact-host owner session with encrypted-only pipe relay; default offline."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import stat
import sys
import tempfile
import urllib.request

UPSTREAM = 'e730c7f2d8f519d0d1d73efe8b0335380ec82288'
RELAY_SOURCE = '61ec804c58d6fc5e2b9bcac06896fe796e5b91ff'
FILES = {
    'owner_session.py': (UPSTREAM, 'start-owner-recovery-session.py', '784d7feb5827ca64ce62382ee2cc067f0c6138fb3baa3bf830dd1c68a029a3bb'),
    'recovery-result-receipt.py': (UPSTREAM, 'recovery-result-receipt.py', '842a6116f3d71ca65a3234431de67711aa5c9c24505cb9d401ee6308f398ca3f'),
    'encrypted-frame-relay.py': (RELAY_SOURCE, 'encrypted-frame-relay.py', '1a9cc397f9a04c9fa656a07555c3c12a0bb076d9f0cf6ce2df0660dd48dce522'),
}
STACK = 'arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/3635fd80-dfa2-11f1-af8a-06ffea20fa49'
INSTANCE = 'i-02fb787d173779b04'


def load_checked(directory, name):
    path = directory/name
    fd = os.open(path,os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as stream:
        info = os.fstat(stream.fileno())
        source = stream.read(32769)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
            or len(source)>32768 or hashlib.sha256(source).hexdigest()!=FILES[name][2]):
        raise ValueError('PINNED_OWNER_COMPONENT_REQUIRED')
    spec = importlib.util.spec_from_file_location('piped_owner_'+name.replace('.','_'),path)
    module = importlib.util.module_from_spec(spec)
    exec(compile(source,str(path),'exec'),module.__dict__)
    return module


def bound_operator(directory):
    operator = load_checked(directory,'owner_session.py')
    operator.STACK = STACK
    operator.INSTANCE = INSTANCE
    helper = operator.receipt_helper()
    relay = load_checked(directory,'encrypted-frame-relay.py')
    helper.run_interactive = relay.run_interactive
    operator.receipt_helper = lambda: helper
    return operator


def prepare():
    directory = Path(tempfile.mkdtemp(prefix='orzell-piped-owner-20261113-',dir=Path.home()))
    os.chmod(directory,0o700)
    for name,(commit,remote,digest) in FILES.items():
        url = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/'+commit+'/infra/operations/'+remote
        with urllib.request.urlopen(url,timeout=30) as response:
            source = response.read(32769)
        if len(source)>32768 or hashlib.sha256(source).hexdigest()!=digest:
            raise ValueError('PINNED_OWNER_DOWNLOAD_REQUIRED')
        fd = os.open(directory/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
        with os.fdopen(fd,'wb') as stream:
            stream.write(source)
    launcher = Path(__file__).read_bytes()
    fd = os.open(directory/'start.py',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o500)
    with os.fdopen(fd,'wb') as stream:
        stream.write(launcher)
    print('SONUCU_OKU: python3 -I '+shlex.quote(str(directory/'start.py'))+' --show-last-result',flush=True)
    return directory


def main():
    arguments = sys.argv[1:]
    if not arguments:
        print(json.dumps({'status':'OFFLINE_NO_ACTION','privateKeyRead':False,'productionDataRead':False}))
        return 0
    if arguments not in (['--start-approved-isolated-restore'],['--show-last-result']):
        print(json.dumps({'status':'UNSUPPORTED_OWNER_SESSION_ARGUMENTS'}))
        return 2
    try:
        directory = prepare() if arguments==['--start-approved-isolated-restore'] else Path(__file__).parent
        return bound_operator(directory).main()
    except Exception as exc:
        reason = str(exc) if isinstance(exc,ValueError) and re.fullmatch('[A-Z_]{1,100}',str(exc)) else 'OWNER_PIPE_SESSION_START_FAILED'
        print(json.dumps({'status':'OWNER_PIPE_SESSION_NOT_STARTED','reason':reason,'realRecoveryReady':False}))
        return 1


if __name__=='__main__':
    raise SystemExit(main())
