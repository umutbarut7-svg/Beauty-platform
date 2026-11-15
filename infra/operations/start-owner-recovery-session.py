#!/usr/bin/env python3
"""Owner CloudShell: exact encrypted snapshot -> approved host -> encrypted stdin.

No private key path or private-key argument exists. Default is offline.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import stat
import tempfile

ACCOUNT = "926642724499"
REGION = "eu-north-1"
STACK = "arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/bda12ce0-decb-11f1-999e-0affea9001a7"
INSTANCE = "i-014e0cd851bcd4169"
SOURCE = "f187f56a080c12370b5986a2ce337e40ca4fab3d"
RUNNER_SHA256 = "36c921f3eb0f31bfaadb479e63c20f4904d9034fa59234da58cea7ede0644c3a"
PACKAGE_SHA256 = "0125b3789379511b52c8a61dbb24f2b847d34626f2a51562fe2a0bc2fa2d1221"
RECEIPT_HELPER_SHA256 = "842a6116f3d71ca65a3234431de67711aa5c9c24505cb9d401ee6308f398ca3f"
APPLICATION_SHA = "2e56def282c97a804a2f3d6c9b36a53b42a09df5"
BACKUP_ID = "orzell-database-20261112"


def receipt_helper():
    path = Path(__file__).with_name('recovery-result-receipt.py')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size > 32768:
            raise ValueError('PINNED_OWNER_RECEIPT_HELPER_REQUIRED')
        source = stream.read(32769)
    if len(source) > 32768 or hashlib.sha256(source).hexdigest() != RECEIPT_HELPER_SHA256:
        raise ValueError('PINNED_OWNER_RECEIPT_HELPER_REQUIRED')
    spec = importlib.util.spec_from_file_location('owner_result_receipt', path)
    helper = importlib.util.module_from_spec(spec)
    exec(compile(source, str(path), 'exec'), helper.__dict__)
    return helper


def receipt_binding():
    return dict(account=ACCOUNT, region=REGION, stackId=STACK, instanceId=INSTANCE,
                runnerSource=SOURCE, runnerSha256=RUNNER_SHA256, packageSha256=PACKAGE_SHA256,
                backupId=BACKUP_ID, applicationSha=APPLICATION_SHA)


def owner_parameters(url, receipt_id):
    # A three-minute capability for ONE version of ciphertext. Never log URL.
    if not isinstance(url, str) or len(url) > 16000 or not url.startswith("https://") or any(c in url for c in "\n\r\x00"):
        raise ValueError("EXACT_ENCRYPTED_SNAPSHOT_URL_REQUIRED")
    if not re.fullmatch(r'[0-9a-f]{32}', receipt_id or ''):
        raise ValueError('VALID_RESULT_RECEIPT_ID_REQUIRED')
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
        'timeout --foreground -s TERM 900 env -i PATH=/usr/bin:/bin LANG=C.UTF-8 python3 -u /opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py --start-isolated-session --encrypted-package "$work/package.zip" --acknowledge-access-invalidation --result-receipt-id '+receipt_id,
    ])
    return {"command": ["sudo sh -c "+shlex.quote(body)]}


def start():
    if not re.fullmatch(r"[0-9a-f]{40}", SOURCE) or not re.fullmatch(r"[0-9a-f]{64}", RUNNER_SHA256):
        raise ValueError("IMMUTABLE_REVIEWED_RUNNER_REQUIRED")
    helper = receipt_helper()
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
    receipt = helper.ReceiptStore(Path.home()/'orzell-recovery-results', receipt_binding())
    try:
        parameters = owner_parameters(url, receipt.receipt_id)
        print(json.dumps({'status':'OWNER_RESULT_FILE_RESERVED', 'receiptId':receipt.receipt_id,
                          'resultPath':str(receipt.directory/'result.json'),
                          'observation':'RESULT_NOT_OBSERVED'}), flush=True)
        with tempfile.TemporaryDirectory(prefix='orzell-encrypted-session-') as temporary:
            directory = Path(temporary)
            os.chmod(directory, 0o700)
            path = directory/'parameters.json'
            fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
            with os.fdopen(fd,'w') as stream:
                json.dump(parameters,stream)
            # Child stdin remains the owner's terminal. Only allowlisted final
            # result fields go to disk; neither stdin nor a transcript is saved.
            return helper.run_interactive(['aws','ssm','start-session','--region',REGION,'--target',INSTANCE,
                '--document-name','AWS-StartInteractiveCommand','--parameters','file://'+str(path)], receipt)
    finally:
        receipt.close()


def main():
    if len(__import__('sys').argv) == 1:
        print(json.dumps({'status':'OFFLINE_NO_ACTION','privateKeyRead':False}))
        return 0
    if __import__('sys').argv[1:] not in (['--start-approved-isolated-restore'], ['--show-last-result']):
        print(json.dumps({'status':'UNSUPPORTED_OWNER_SESSION_ARGUMENTS'}))
        return 2
    try:
        if __import__('sys').argv[1:] == ['--show-last-result']:
            print(json.dumps(receipt_helper().show_last_result(Path.home()/'orzell-recovery-results'), sort_keys=True))
            return 0
        return start()
    except Exception as exc:
        reason = str(exc) if isinstance(exc,ValueError) and re.fullmatch('[A-Z_]{1,100}',str(exc)) else 'OWNER_SESSION_START_FAILED'
        status = 'OWNER_RESULT_READ_REJECTED' if __import__('sys').argv[1:] == ['--show-last-result'] else 'OWNER_SESSION_NOT_STARTED'
        print(json.dumps({'status':status,'reason':reason,'realRecoveryReady':False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

