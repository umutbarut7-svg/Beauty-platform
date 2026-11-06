#!/usr/bin/env python3
"""Read-only post-activation inspection; never starts a backup or reads its body."""

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


ROOT = Path('/opt/epifiz/backup')
RELEASE = '247668b35e8a8d63cdfda3f0e56dbc50be1acdab'
SIGNER = '1c99e1da54a5e4a303c98f42fddb15c8d924320a6ef772bbf15c61cebc22f13f'
ACCOUNT = '926642724499'
BUCKET = 'orzell-backups-926642724499-eu-north-1'
ROLE = 'BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh'
REQUEST = {'request_id': 'orzell-managed-backup-inspection-20261106-1', 'mode': 'read-only-health-and-receipt'}
RECOVERY_EXPORT = {'request_id': 'orzell-recovery-binding-20261107-1', 'mode': 'read-only-encrypted-snapshot-binding'}


def run(args):
    # This guard also applies to every command issued by the embedded helper.
    permitted = (args[:3] == ['docker', 'inspect', '--format']
                 or args[:2] == ['systemctl', 'show']
                 or args[:2] == ['systemctl', 'is-enabled'])
    if not permitted:
        raise ValueError('INSPECTION_COMMAND_NOT_ALLOWED')
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25)
    if result.returncode:
        raise ValueError('INSPECTION_COMMAND_UNAVAILABLE')
    return result.stdout


def aws(service, operation, *args):
    if (service, operation) not in {('sts', 'get-caller-identity'), ('s3api', 'head-object')}:
        raise ValueError('INSPECTION_AWS_OPERATION_NOT_ALLOWED')
    result = subprocess.run(['aws', service, operation, *args, '--region', 'eu-north-1', '--output', 'json',
                             '--no-cli-pager', '--cli-connect-timeout', '5', '--cli-read-timeout', '20'],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=30,
                            env={**os.environ, 'AWS_MAX_ATTEMPTS': '1', 'AWS_PAGER': ''})
    if result.returncode:
        raise ValueError('INSPECTION_METADATA_UNAVAILABLE')
    return json.loads(result.stdout)


def instant(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value):
        raise ValueError('INVALID_BACKUP_TIMESTAMP')
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)


def inspect(request, helper, hashes, execute=run, call=aws, root=ROOT, unit_root=Path('/etc/systemd/system'), now=None, recovery_request=None):
    if request != REQUEST or set(hashes) != helper.FILES or not all(re.fullmatch('[0-9a-f]{64}', v) for v in hashes.values()):
        raise ValueError('FIXED_INSPECTION_BINDING_REQUIRED')
    if recovery_request is not None and recovery_request != RECOVERY_EXPORT:
        raise ValueError('FIXED_RECOVERY_EXPORT_REQUIRED')
    now = now or datetime.now(timezone.utc)
    root = Path(root)
    release = root / 'releases' / RELEASE
    expected = {'version': 1, 'recipient': helper.PIN, 'signer': SIGNER, 'application': helper.APPLICATION,
                'image': helper.IMAGE, 'release': RELEASE}
    if json.loads(helper.existing(root / 'managed-config.json')) != expected:
        raise ValueError('INSTALLED_CONFIGURATION_DIFFERS')
    for name, digest in hashes.items():
        if hashlib.sha256(helper.existing(release / name, 40000)).hexdigest() != digest:
            raise ValueError('INSTALLED_BACKUP_TOOL_DIFFERS')
    before = helper.services(execute)
    for name, content in helper.units(release, root).items():
        if helper.existing(Path(unit_root) / name, private=False) != content.encode():
            raise ValueError('INSTALLED_BACKUP_UNIT_DIFFERS')
        if execute(['systemctl', 'show', '--property=DropInPaths', '--value', name]).strip():
            raise ValueError('UNREVIEWED_UNIT_OVERRIDE')
        if name.endswith('.timer'):
            if execute(['systemctl', 'is-enabled', name]).strip() != b'enabled':
                raise ValueError('BACKUP_TIMER_DISABLED')
            if execute(['systemctl', 'show', '--property=ActiveState', '--value', name]).strip() != b'active':
                raise ValueError('BACKUP_TIMER_INACTIVE')
        else:
            for prop, expected_value in [('Result', b'success'), ('ExecMainStatus', b'0')]:
                if execute(['systemctl', 'show', '--property=' + prop, '--value', name]).strip() != expected_value:
                    raise ValueError('BACKUP_UNIT_FAILURE')
    state_bytes = helper.existing(root / 'state/state.json')
    state = json.loads(state_bytes)
    success = instant(state.get('lastSuccessAt'))
    attempt = instant(state.get('lastAttemptAt'))
    if state.get('lastAttemptStatus') != 'SUCCESS' or not attempt <= success <= now or (now - success).total_seconds() > 26 * 3600:
        raise ValueError('BACKUP_NOT_HEALTHY')
    # Match the actual fixed daily namespace rather than accepting a state-supplied path.
    day = attempt.strftime('%Y-%m-%d')
    backup_id = 'orzell-database-' + attempt.strftime('%Y%m%d')
    key = 'encrypted/v1/daily/' + day + '/' + backup_id + '.zip'
    if state.get('lastReceiptKey') != key:
        raise ValueError('BACKUP_STATE_KEY_DIFFERS')
    receipt = json.loads(helper.existing(root / 'runs' / day / 'result.json'))
    if (receipt.get('status') != 'BACKUP_VERIFIED' or receipt.get('backupId') != backup_id
            or receipt.get('objectKey') != key or receipt.get('applicationSha') != helper.APPLICATION
            or receipt.get('recipient') != helper.PIN or receipt.get('signer') != SIGNER
            or receipt.get('retentionDays') != 30 or receipt.get('privateRecoveryKeyUsed') is not False
            or instant(receipt.get('createdAt')) != attempt or instant(receipt.get('verifiedAt')) != success
            or type(receipt.get('bytes')) is not int or not 0 < receipt['bytes'] <= 128 * 1024 * 1024
            or not re.fullmatch('[0-9a-f]{64}', receipt.get('sha256', ''))
            or not isinstance(receipt.get('versionId'), str) or receipt['versionId'] in ('', 'null')):
        raise ValueError('VERIFIED_RECEIPT_DIFFERS')
    identity = call('sts', 'get-caller-identity')
    if identity.get('Account') != ACCOUNT or not identity.get('Arn', '').startswith('arn:aws:sts::' + ACCOUNT + ':assumed-role/' + ROLE + '/'):
        raise ValueError('RUNTIME_IDENTITY_DIFFERS')
    metadata = call('s3api', 'head-object', '--bucket', BUCKET, '--expected-bucket-owner', ACCOUNT,
                    '--key', key, '--checksum-mode', 'ENABLED')
    if (metadata.get('VersionId') != receipt['versionId'] or metadata.get('ContentLength') != receipt['bytes']
            or metadata.get('ServerSideEncryption') != 'AES256'
            or metadata.get('ChecksumSHA256') != base64.b64encode(bytes.fromhex(receipt['sha256'])).decode()):
        raise ValueError('REMOTE_RECEIPT_METADATA_DIFFERS')
    if state_bytes != helper.existing(root / 'state/state.json') or before != helper.services(execute):
        raise ValueError('INSPECTION_SNAPSHOT_CHANGED_RETRY_READ_ONLY')
    # Fifteen minutes covers the configured accuracy and bounded backup deadline.
    due = now.replace(hour=0, minute=15, second=0, microsecond=0)
    expected_day = now.date() if now >= due else (now - timedelta(days=1)).date()
    scheduled = attempt.date() >= expected_day
    report = {'status': 'MANAGED_BACKUP_INSPECTED', 'healthy': True, 'checkedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'lastSuccessAt': state['lastSuccessAt'], 'ageSeconds': int((now - success).total_seconds()),
            'backupDay': day, 'bytes': receipt['bytes'], 'scheduledBackupObserved': scheduled,
            'timersEnabledAndActive': True, 'serviceResultsSuccessful': True, 'remoteMetadataMatchesReceipt': True,
            'applicationServicesUnchanged': True, 'databaseRead': False, 'backupBodyRead': False,
            'privateKeyRead': False, 'writesPerformed': False, 'restoreVerified': False}
    if recovery_request is not None:
        # Return only the exact successful receipt that matched the remote head.
        # No package/body/key is opened, and no receipt field selects a command.
        if (not scheduled or not re.fullmatch(r'[A-Za-z0-9+/=_\-.]{1,1024}', receipt['versionId'])
                or (success - attempt).total_seconds() > 660):
            raise ValueError('RECOVERY_SNAPSHOT_BINDING_UNAVAILABLE')
        report['recoveryBinding'] = {
            'version': 1, 'kind': 'ENCRYPTED_SNAPSHOT_METADATA_ONLY',
            'region': 'eu-north-1', 'account': ACCOUNT, 'bucket': BUCKET, 'objectKey': key,
            'versionId': receipt['versionId'], 'packageBytes': receipt['bytes'], 'packageSha256': receipt['sha256'],
            'backupId': backup_id, 'applicationSha': helper.APPLICATION, 'sourceImage': helper.IMAGE,
            'snapshotBoundary': 'LIVE_DAILY_SNAPSHOT', 'expectedSigner': SIGNER, 'expectedRecipient': helper.PIN,
            'notBefore': state['lastAttemptAt'], 'notAfter': state['lastSuccessAt'],
            'maxPackageBytes': receipt['bytes'], 'maxCipherBytes': receipt['bytes'],
            'independentRecoveryApproval': False, 'privateKeyRead': False, 'backupBodyRead': False, 'restoreVerified': False}
    return report


if __name__ == '__main__':
    try:
        if os.geteuid() != 0:
            raise ValueError('ROOT_INSPECTION_REQUIRED')
        report = inspect(globals().get('INSPECTION_REQUEST'), globals().get('INSTALLER'), globals().get('TOOL_HASHES'),
                         recovery_request=globals().get('RECOVERY_REQUEST'))
        print(json.dumps(report, sort_keys=True))
    except Exception as error:
        # No paths, object identifiers, exception strings, command stderr or data.
        reason = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z_]{1,100}', str(error)) else type(error).__name__
        print(json.dumps({'status': 'MANAGED_BACKUP_INSPECTION_FAILED', 'reason': reason}))
        raise SystemExit(1)
