#!/usr/bin/env python3
"""Owner CloudShell: exact encrypted snapshot -> approved host -> encrypted stdin.

No private key path or private-key argument exists. Default is offline.
"""
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import tempfile

ACCOUNT = "926642724499"
REGION = "eu-north-1"
STACK = "arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/bda12ce0-decb-11f1-999e-0affea9001a7"
INSTANCE = "i-014e0cd851bcd4169"
SOURCE = "ee77763668110e82ea14bc5f13f392ae77e588f7"
RUNNER_SHA256 = "b2a364c12d76ec57e2f8c240da93a40802f44793f4aeaec5c734c1e55fda1bcc"
PACKAGE_SHA256 = "0125b3789379511b52c8a61dbb24f2b847d34626f2a51562fe2a0bc2fa2d1221"


def owner_parameters(url):
    # A three-minute capability for ONE version of ciphertext. Never log URL.
    if not isinstance(url, str) or len(url) > 16000 or not url.startswith("https://") or any(c in url for c in "\n\r\x00"):
        raise ValueError("EXACT_ENCRYPTED_SNAPSHOT_URL_REQUIRED")
    runner = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/"+SOURCE+"/infra/operations/run-recovery-session.py"
    body = "\n".join([
        "set -eu", "umask 077", "work=$(mktemp -d /run/orzell-owner-session.XXXXXX)",
        "trap 'rm -rf -- \"$work\"' EXIT HUP INT TERM",
        "curl -fsS --proto '=https' --max-time 60 --max-filesize 667576 "+shlex.quote(url)+' -o "$work/package.zip"',
        "test \"$(stat -c %s \"$work/package.zip\")\" = 667576",
        "printf '%s  %s\\n' "+shlex.quote(PACKAGE_SHA256)+' "$work/package.zip" | sha256sum -c -',
        "curl -fsS --proto '=https' --max-time 60 --max-filesize 32768 "+shlex.quote(runner)+' -o "$work/runner.py"',
        "printf '%s  %s\\n' "+shlex.quote(RUNNER_SHA256)+' "$work/runner.py" | sha256sum -c -',
        'install -m 0400 "$work/runner.py" /opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py',
        'timeout -s TERM 900 env -i PATH=/usr/bin:/bin LANG=C.UTF-8 python3 -u /opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py --start-isolated-session --encrypted-package "$work/package.zip" --acknowledge-access-invalidation',
    ])
    return {"command": ["sudo sh -c "+shlex.quote(body)]}


def start():
    if not re.fullmatch(r"[0-9a-f]{40}", SOURCE) or not re.fullmatch(r"[0-9a-f]{64}", RUNNER_SHA256):
        raise ValueError("IMMUTABLE_REVIEWED_RUNNER_REQUIRED")
    import boto3
    from botocore.config import Config
    session = boto3.Session(region_name=REGION)
    if session.client('sts').get_caller_identity()['Account'] != ACCOUNT:
        raise ValueError("OWNER_ACCOUNT_MISMATCH")
    stack = session.client('cloudformation').describe_stacks(StackName=STACK)['Stacks'][0]
    outputs = {v['OutputKey']: v['OutputValue'] for v in stack.get('Outputs', [])}
    if (stack['StackId'] != STACK or stack['StackStatus'] != 'CREATE_COMPLETE'
            or outputs.get('InstanceId') != INSTANCE
            or outputs.get('Purpose') != 'PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED'):
        raise ValueError("APPROVED_RUNTIME_STACK_REQUIRED")
    instances = session.client('ec2').describe_instances(InstanceIds=[INSTANCE])['Reservations']
    if len(instances) != 1 or len(instances[0]['Instances']) != 1 or instances[0]['Instances'][0]['State']['Name'] != 'running':
        raise ValueError("APPROVED_RUNTIME_NOT_RUNNING_NO_RECREATE")
    url = session.client('s3', config=Config(signature_version='s3v4')).generate_presigned_url('get_object', Params={
        'Bucket':'orzell-backups-926642724499-eu-north-1',
        'Key':'encrypted/v1/daily/2026-11-12/orzell-database-20261112.zip',
        'VersionId':'bGbetc6wxE4Ru1KA_7zmspAnlu5.CTfE'}, ExpiresIn=180)
    parameters = owner_parameters(url)
    with tempfile.TemporaryDirectory(prefix='orzell-encrypted-session-') as temporary:
        directory = Path(temporary)
        os.chmod(directory, 0o700)
        path = directory/'parameters.json'
        fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        with os.fdopen(fd,'w') as stream:
            json.dump(parameters,stream)
        # AWS and SSM receive only ciphertext capability and encrypted capsule.
        return subprocess.run(['aws','ssm','start-session','--region',REGION,'--target',INSTANCE,
            '--document-name','AWS-StartInteractiveCommand','--parameters','file://'+str(path)], check=False).returncode


def main():
    if len(__import__('sys').argv) == 1:
        print(json.dumps({'status':'OFFLINE_NO_ACTION','privateKeyRead':False}))
        return 0
    if __import__('sys').argv[1:] != ['--start-approved-isolated-restore']:
        print(json.dumps({'status':'UNSUPPORTED_OWNER_SESSION_ARGUMENTS'}))
        return 2
    try:
        return start()
    except Exception as exc:
        reason = str(exc) if isinstance(exc,ValueError) and re.fullmatch('[A-Z_]{1,100}',str(exc)) else 'OWNER_SESSION_START_FAILED'
        print(json.dumps({'status':'OWNER_SESSION_NOT_STARTED','reason':reason,'realRecoveryReady':False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
