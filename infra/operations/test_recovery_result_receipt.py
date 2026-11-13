import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

OPS = Path(__file__).parent


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, OPS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


RECEIPT = load('receipt_test', 'recovery-result-receipt.py')
RUN = load('receipt_runner_test', 'run-recovery-session.py')
START = load('receipt_start_test', 'start-owner-recovery-session.py')


def generated_success(receipt_id, *, actual=False):
    # Generated protocol fixture, never a real restore acceptance.
    return dict(status=RECEIPT.SUCCESS, resultReceiptId=receipt_id,
                actualBackupRestoredToIsolatedDatabase=actual, temporaryDatabaseRemoved=True,
                domainIntegrityChecked=True, domainRecordsPreservedAcrossQuarantine=True,
                protectedHandoffConsumed=True, privateKeyRead=True, productionDataRead=actual,
                productionRestoreVerified=False, publicPorts=False, reopenAuthorized=False,
                realRecoveryReady=False, network='none', sourceApplicationSha=START.APPLICATION_SHA,
                observedSnapshotAgeAtDrillSeconds=100.25, handoffAndRestoreDrillSeconds=2.5,
                packageVerificationAndDecryptionSeconds=0.5, controllerElapsedSeconds=1.5,
                drillStartedAt='2026-11-13T07:00:00+00:00', backupSnapshotAt='2026-11-12T00:00:07Z')


class ResultReceiptTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name) / 'results'
        self.receipt = RECEIPT.ReceiptStore(self.base, START.receipt_binding())
        self.addCleanup(self.temporary.cleanup)
        self.addCleanup(self.receipt.close)

    def saved(self):
        return RECEIPT.show_last_result(self.base)

    def send(self, value):
        self.receipt.feed(json.dumps(value).encode() + b'\n')

    def test_reserves_private_result_before_input_and_never_guesses_success(self):
        value = self.saved()
        self.assertEqual(value['observation'], 'RESULT_NOT_OBSERVED')
        self.assertNotIn('result', value)
        self.assertFalse(value['independentAttestation'])
        self.assertFalse(value['productionReopenAuthorized'])
        self.assertEqual(stat.S_IMODE(self.base.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(self.receipt.directory.stat().st_mode), 0o700)
        self.assertEqual(stat.S_IMODE((self.receipt.directory/'result.json').stat().st_mode), 0o600)
        self.receipt.finish(0)
        self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')

    def test_fragmented_result_survives_reopen_without_private_or_unknown_fields(self):
        value = generated_success(self.receipt.receipt_id)
        value.update(key='GENERATED_PRIVATE_CONTENT', capsule='GENERATED_CAPSULE', reason='GENERATED_ERROR_CONTENT')
        raw = json.dumps(value).encode() + b'\r\n'
        self.receipt.feed(b'ORZELL-CAPSULE-V1\nGENERATED_CAPSULE\nEND-ORZELL-CAPSULE\n')
        self.receipt.feed(b'{"challengeBase64":"PUBLIC_CHALLENGE","status":"WAITING_FOR_ENCRYPTED_CAPSULE"}\n')
        for index in range(0, len(raw), 7):
            self.receipt.feed(raw[index:index+7])
        self.receipt.close()
        result = self.saved()
        text = (self.receipt.directory/'result.json').read_text()
        self.assertEqual(result['observation'], 'OWNER_TERMINAL_RESULT_OBSERVED')
        self.assertFalse(result['result']['actualBackupRestoredToIsolatedDatabase'])
        self.assertFalse(result['result']['productionDataRead'])
        self.assertNotIn('GENERATED_', text)
        self.assertNotIn('PUBLIC_CHALLENGE', text)
        self.assertNotIn('challengeBase64', text)

    def test_stale_duplicate_malformed_and_partial_results_are_not_accepted(self):
        self.send(generated_success('0'*32))
        value = generated_success(self.receipt.receipt_id)
        raw = json.dumps(value).encode()
        self.receipt.feed(raw[:-1] + b',"realRecoveryReady":false}\n')
        self.receipt.feed(b'{"resultReceiptId":"'+self.receipt.receipt_id.encode()+b'",\n')
        self.receipt.feed(raw[:-2])
        self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')

    def test_missing_checks_wrong_types_and_reopening_cannot_become_success(self):
        changes = [{'temporaryDatabaseRemoved':False}, {'domainIntegrityChecked':1},
                   {'protectedHandoffConsumed':False}, {'productionRestoreVerified':True},
                   {'publicPorts':True}, {'reopenAuthorized':True}, {'realRecoveryReady':True},
                   {'network':'bridge'}, {'sourceApplicationSha':'0'*40},
                   {'controllerElapsedSeconds':True}, {'controllerElapsedSeconds':float('nan')},
                   {'backupSnapshotAt':'2026-99-99T00:00:07Z'}, {'productionDataRead':True}]
        for change in changes:
            with self.subTest(change=change):
                self.send(dict(generated_success(self.receipt.receipt_id), **change))
                self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')
        value = generated_success(self.receipt.receipt_id)
        value.pop('temporaryDatabaseRemoved')
        self.send(value)
        self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')

    def test_line_limit_recovers_at_newline_without_unbounded_memory(self):
        for _ in range(20):
            self.receipt.feed(b'x'*4096)
            self.assertLessEqual(len(self.receipt.buffer), RECEIPT.MAX_LINE)
        self.receipt.feed(b'\n')
        self.send(generated_success(self.receipt.receipt_id))
        self.assertEqual(self.saved()['observation'], 'OWNER_TERMINAL_RESULT_OBSERVED')

    def test_stop_then_rejection_preserves_input_uncertainty_and_drops_reason(self):
        self.send(dict(status=RECEIPT.STOPPED, resultReceiptId=self.receipt.receipt_id,
                       capsuleSubmitted=True, privateMaterialMayHaveBeenProcessed=True, realRecoveryReady=False))
        self.send(dict(status=RECEIPT.REJECTED, resultReceiptId=self.receipt.receipt_id,
                       reason='GENERATED_SENSITIVE_ERROR', realRecoveryReady=False))
        self.assertTrue(self.saved()['capsuleSubmissionObserved'])
        self.assertEqual(self.saved()['result']['status'], RECEIPT.REJECTED)
        self.assertNotIn('GENERATED_SENSITIVE_ERROR', (self.receipt.directory/'result.json').read_text())
        self.assertNotIn('privateKeyRead', self.saved()['result'])

    def test_conflicting_terminal_results_remove_success_claim(self):
        self.send(generated_success(self.receipt.receipt_id))
        self.send(generated_success(self.receipt.receipt_id))
        self.assertEqual(self.saved()['observation'], 'CONFLICTING_RESULTS_NOT_VERIFIED')
        self.assertNotIn('result', self.saved())

    def test_latest_incomplete_attempt_does_not_fall_back_to_older_success(self):
        self.send(generated_success(self.receipt.receipt_id))
        with patch.object(RECEIPT.secrets, 'token_hex', return_value='f'*32):
            newer = RECEIPT.ReceiptStore(self.base, START.receipt_binding())
        self.addCleanup(newer.close)
        self.receipt.finish(0)
        self.assertEqual(self.saved()['receiptId'], newer.receipt_id)
        self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')

    def test_symlink_and_permissive_directory_or_file_are_rejected(self):
        link = Path(self.temporary.name)/'linked'
        link.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(OSError):
            RECEIPT.ReceiptStore(link, START.receipt_binding())
        path = self.receipt.directory/'result.json'
        path.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'PRIVATE_OWNER_RESULT_FILE_REQUIRED'):
            self.saved()
        path.unlink()
        target = Path(self.temporary.name)/'unread-private-material'
        target.write_text('GENERATED_DO_NOT_READ')
        path.symlink_to(target)
        with self.assertRaises(OSError):
            self.saved()
        self.base.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'PRIVATE_OWNER_RESULT_DIRECTORY_REQUIRED'):
            RECEIPT.ReceiptStore(self.base, START.receipt_binding())

    def test_saved_result_reprint_filters_unknown_fields(self):
        path = self.receipt.directory/'result.json'
        value = json.loads(path.read_text())
        value['rawTranscript'] = 'GENERATED_DO_NOT_REPRINT'
        path.write_text(json.dumps(value))
        self.assertNotIn('GENERATED_DO_NOT_REPRINT', json.dumps(self.saved()))

    def test_insecure_attempt_cannot_hide_behind_an_older_success(self):
        self.send(generated_success(self.receipt.receipt_id))
        link = self.base/('e'*32)
        link.symlink_to(self.receipt.directory, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'PRIVATE_OWNER_ATTEMPT_REQUIRED'):
            self.saved()

    def test_pty_preserves_terminal_output_and_saves_before_broken_mirror(self):
        value = generated_success(self.receipt.receipt_id)
        program = ('import os,json; assert os.isatty(1) and os.isatty(2); '
                   'assert os.read(0,100)==b"GENERATED_CAPSULE_INPUT"; '
                   'print("GENERATED_DO_NOT_SAVE",flush=True); print('+repr(json.dumps(value))+',flush=True)')
        with tempfile.TemporaryFile() as incoming:
            incoming.write(b'GENERATED_CAPSULE_INPUT'); incoming.seek(0)
            def closed_browser(_):
                raise BrokenPipeError()
            code = RECEIPT.run_interactive([sys.executable, '-c', program], self.receipt,
                                           stdin=incoming, mirror=closed_browser, timeout_seconds=5)
        self.assertEqual(code, 0)
        self.assertEqual(self.saved()['observation'], 'OWNER_TERMINAL_RESULT_OBSERVED')
        self.assertNotIn('GENERATED_', (self.receipt.directory/'result.json').read_text())

    def test_process_failure_or_timeout_without_result_remains_unobserved(self):
        for program, timeout, expected in [('raise SystemExit(7)', 5, 7),
                                          ('import time; time.sleep(10)', .1, 124)]:
            code = RECEIPT.run_interactive([sys.executable, '-c', program], self.receipt,
                                           stdin=subprocess.DEVNULL, mirror=lambda _:None, timeout_seconds=timeout)
            self.assertEqual(code, expected)
            self.assertEqual(self.saved()['observation'], 'RESULT_NOT_OBSERVED')

    def test_runner_tags_only_final_results_and_requires_explicit_valid_id(self):
        with contextlib.redirect_stdout(io.StringIO()) as captured:
            output = RUN.receipt_output('a'*32)
            output({'status':'WAITING_FOR_ENCRYPTED_CAPSULE'})
            output({'status':RECEIPT.REJECTED, 'realRecoveryReady':False})
        lines = [json.loads(line) for line in captured.getvalue().splitlines()]
        self.assertNotIn('resultReceiptId', lines[0])
        self.assertEqual(lines[1]['resultReceiptId'], 'a'*32)
        for value in (None, 'a'*31, 'x'*32, 'a'*32+';false'):
            with self.assertRaisesRegex(ValueError, 'VALID_RESULT_RECEIPT_ID_REQUIRED'):
                RUN.receipt_output(value)
            with self.assertRaisesRegex(ValueError, 'VALID_RESULT_RECEIPT_ID_REQUIRED'):
                START.owner_parameters('https://example.test/generated', value)
        with patch.object(RUN, 'run_owner') as run:
            with patch.object(sys, 'argv', ['run', '--start-isolated-session', '--encrypted-package', 'generated', '--acknowledge-access-invalidation']):
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(RUN.main(), 1)
            run.assert_not_called()

    def test_operator_helper_pin_and_saved_result_mode_need_no_aws(self):
        expected = hashlib.sha256((OPS/'recovery-result-receipt.py').read_bytes()).hexdigest()
        self.assertEqual(START.RECEIPT_HELPER_SHA256, expected)
        self.assertEqual(START.RUNNER_SHA256, hashlib.sha256((OPS/'run-recovery-session.py').read_bytes()).hexdigest())
        helper = START.receipt_helper()
        with patch.object(Path, 'home', return_value=Path(self.temporary.name)):
            with patch.object(START, 'start', side_effect=AssertionError('AWS must not be called')):
                with patch.object(sys, 'argv', ['operator', '--show-last-result']):
                    with contextlib.redirect_stdout(io.StringIO()) as captured:
                        self.assertEqual(START.main(), 0)
        self.assertEqual(json.loads(captured.getvalue())['status'], 'NO_SAVED_OWNER_RESULT')
        with patch.object(START, 'RECEIPT_HELPER_SHA256', '0'*64):
            with self.assertRaisesRegex(ValueError, 'PINNED_OWNER_RECEIPT_HELPER_REQUIRED'):
                START.receipt_helper()


if __name__ == '__main__':
    unittest.main()
