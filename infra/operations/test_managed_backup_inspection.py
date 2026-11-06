import base64
import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


CHECK = module('inspection', 'inspect-managed-backup.py')
INSTALL = module('installer', 'install-managed-backup.py')


class BackupInspectionTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 6, 8, tzinfo=timezone.utc)
        self.state = {'lastAttemptAt': '2026-11-06T00:00:01Z', 'lastSuccessAt': '2026-11-06T00:00:15Z',
                      'lastAttemptStatus': 'SUCCESS',
                      'lastReceiptKey': 'encrypted/v1/daily/2026-11-06/orzell-database-20261106.zip'}
        self.receipt = {'status': 'BACKUP_VERIFIED', 'backupId': 'orzell-database-20261106',
                        'objectKey': self.state['lastReceiptKey'], 'applicationSha': INSTALL.APPLICATION,
                        'recipient': INSTALL.PIN, 'signer': CHECK.SIGNER, 'retentionDays': 30,
                        'privateRecoveryKeyUsed': False, 'createdAt': self.state['lastAttemptAt'],
                        'verifiedAt': self.state['lastSuccessAt'], 'bytes': 12345, 'sha256': 'a' * 64, 'versionId': 'fixture-version'}
        self.settings = {'version': 1, 'recipient': INSTALL.PIN, 'signer': CHECK.SIGNER,
                         'application': INSTALL.APPLICATION, 'image': INSTALL.IMAGE, 'release': CHECK.RELEASE}
        self.hashes = {name: CHECK.hashlib.sha256(b'fixture-tool').hexdigest() for name in INSTALL.FILES}
        self.definitions = INSTALL.units(CHECK.ROOT / 'releases' / CHECK.RELEASE)
        self.reads, self.commands, self.aws_calls = [], [], []
        self.override = False
        self.disabled = False
        self.service_failure = False
        self.changed = False
        self.metadata = {'VersionId': 'fixture-version', 'ContentLength': 12345, 'ServerSideEncryption': 'AES256',
                         'ChecksumSHA256': base64.b64encode(bytes.fromhex('a' * 64)).decode()}
        self.helper = types.SimpleNamespace(FILES=INSTALL.FILES, PIN=INSTALL.PIN, APPLICATION=INSTALL.APPLICATION,
                                            IMAGE=INSTALL.IMAGE, units=INSTALL.units, existing=self.read, services=self.services)
        self.snapshots = 0

    def services(self, execute):
        self.snapshots += 1
        return {'source': 'changed' if self.changed and self.snapshots > 1 else 'same'}

    def read(self, path, *args, **kwargs):
        self.reads.append(str(path))
        if path.name == 'managed-config.json':
            return json.dumps(self.settings).encode()
        if path.name == 'state.json':
            return json.dumps(self.state).encode()
        if path.name == 'result.json':
            return json.dumps(self.receipt).encode()
        if path.name in self.definitions:
            return self.definitions[path.name].encode()
        if path.name in INSTALL.FILES:
            return b'fixture-tool'
        raise AssertionError('Unexpected file read: ' + str(path))

    def execute(self, args):
        self.commands.append(args)
        if '--property=DropInPaths' in args:
            return b'/unreviewed' if self.override else b''
        if args[:2] == ['systemctl', 'is-enabled']:
            return b'disabled' if self.disabled else b'enabled'
        if '--property=ActiveState' in args:
            return b'active'
        if '--property=Result' in args:
            return b'exit-code' if self.service_failure else b'success'
        if '--property=ExecMainStatus' in args:
            return b'0'
        raise AssertionError('Unexpected command')

    def aws(self, service, operation, *args):
        self.aws_calls.append((service, operation, args))
        if (service, operation) == ('sts', 'get-caller-identity'):
            return {'Account': CHECK.ACCOUNT, 'Arn': 'arn:aws:sts::' + CHECK.ACCOUNT + ':assumed-role/' + CHECK.ROLE + '/fixture'}
        if (service, operation) == ('s3api', 'head-object'):
            self.assertNotIn('--version-id', args)
            self.assertEqual(args[args.index('--key') + 1], self.receipt['objectKey'])
            return self.metadata
        raise AssertionError('Unexpected AWS operation')

    def inspect(self):
        return CHECK.inspect(copy.deepcopy(CHECK.REQUEST), self.helper, self.hashes, execute=self.execute, call=self.aws, now=self.now)

    def test_success_is_metadata_only_and_never_opens_keys(self):
        report = self.inspect()
        self.assertTrue(report['scheduledBackupObserved'])
        self.assertFalse(report['writesPerformed'])
        self.assertFalse(report['restoreVerified'])
        self.assertFalse(any('signing/' in p or '.cms' in p or '.zip' in p for p in self.reads))
        self.assertEqual([x[:2] for x in self.aws_calls], [('sts', 'get-caller-identity'), ('s3api', 'head-object')])

    def test_stale_failed_future_and_abandoned_states_fail_before_remote_read(self):
        original = copy.deepcopy(self.state)
        for change in [{'lastAttemptStatus': 'FAILED'}, {'lastAttemptStatus': 'RUNNING'},
                       {'lastSuccessAt': '2026-11-04T00:00:00Z'}, {'lastSuccessAt': '2026-11-07T00:00:00Z'}]:
            with self.subTest(change=change):
                self.state = {**original, **change}
                with self.assertRaises(ValueError):
                    self.inspect()
                self.assertFalse(self.aws_calls)

    def test_initial_backup_is_not_reported_as_todays_scheduled_backup(self):
        self.now = datetime(2026, 11, 7, 0, 20, tzinfo=timezone.utc)
        report = self.inspect()
        self.assertTrue(report['healthy'])
        self.assertFalse(report['scheduledBackupObserved'])

    def test_remote_size_checksum_version_or_encryption_mismatch_fails(self):
        original = copy.deepcopy(self.metadata)
        for field, value in [('ContentLength', 1), ('ChecksumSHA256', 'bad'), ('VersionId', 'other'), ('ServerSideEncryption', 'aws:kms')]:
            with self.subTest(field=field):
                self.metadata = {**original, field: value}
                with self.assertRaisesRegex(ValueError, 'REMOTE_RECEIPT'):
                    self.inspect()

    def test_local_configuration_tool_and_receipt_mismatch_fails(self):
        self.settings['signer'] = 'b' * 64
        with self.assertRaisesRegex(ValueError, 'CONFIGURATION'):
            self.inspect()
        self.settings['signer'] = CHECK.SIGNER
        self.hashes['produce-backup.py'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'TOOL_DIFFERS'):
            self.inspect()
        self.hashes['produce-backup.py'] = CHECK.hashlib.sha256(b'fixture-tool').hexdigest()
        self.receipt['signer'] = 'b' * 64
        with self.assertRaisesRegex(ValueError, 'RECEIPT_DIFFERS'):
            self.inspect()

    def test_unknown_override_disabled_timer_and_service_failure_fail(self):
        for attr in ['override', 'disabled', 'service_failure']:
            with self.subTest(attr=attr):
                setattr(self, attr, True)
                with self.assertRaises(ValueError):
                    self.inspect()
                setattr(self, attr, False)

    def test_service_change_during_inspection_rejects_snapshot(self):
        self.changed = True
        with self.assertRaisesRegex(ValueError, 'SNAPSHOT_CHANGED'):
            self.inspect()

    def test_path_in_state_cannot_select_arbitrary_file(self):
        self.state['lastReceiptKey'] = '../../signing/signer.key'
        with self.assertRaisesRegex(ValueError, 'STATE_KEY_DIFFERS'):
            self.inspect()
        self.assertFalse(any(p.endswith('result.json') for p in self.reads))

    def test_production_command_guards_reject_mutations_before_subprocess(self):
        with patch.object(CHECK.subprocess, 'run', side_effect=AssertionError('Must not run')):
            for args in [['systemctl', 'start', 'orzell-database-backup.service'], ['docker', 'exec', 'database', 'pg_dump'], ['python3', 'anything']]:
                with self.assertRaisesRegex(ValueError, 'COMMAND_NOT_ALLOWED'):
                    CHECK.run(args)
            for pair in [('s3api', 'get-object'), ('s3api', 'put-object'), ('cloudwatch', 'put-metric-data')]:
                with self.assertRaisesRegex(ValueError, 'AWS_OPERATION_NOT_ALLOWED'):
                    CHECK.aws(*pair)


if __name__ == '__main__':
    unittest.main()
