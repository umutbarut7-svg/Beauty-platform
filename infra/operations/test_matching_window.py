"""Offline status preservation and original-quota restoration checks."""
import contextlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = pathlib.Path(__file__).with_name('matching-test-window.py')
SPEC = importlib.util.spec_from_file_location('matching_window', SOURCE)
WINDOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WINDOW)
START = 1793301840
END = START + 600
LOG = "timestamp: '2026-10-29T19:28:00.000Z', method: 'POST', route: '/api/mvp/v1/visual/sessions/PRIVATE_SESSION/matches', actorId: 'PRIVATE_OWNER', token: 'PRIVATE_TOKEN', statusCode: 500"


class ResponsePreservationTests(unittest.TestCase):
    def test_only_whitelisted_status_metadata_survives(self):
        rows = WINDOW.matching_http_rows(LOG, START, END)
        self.assertEqual(rows[0]['status'], 500)
        self.assertEqual(set(rows[0]), {'timestamp', 'method', 'route', 'status'})
        self.assertNotIn('PRIVATE', json.dumps(rows))

    def test_json_and_ansi_logs_are_supported(self):
        raw = '\x1b[32m' + json.dumps({'timestamp': '2026-10-29T19:28:00Z', 'method': 'POST', 'route': '/visual/sessions/private/matches', 'statusCode': 200}) + '\x1b[0m'
        self.assertEqual(WINDOW.matching_http_rows(raw, START, END)[0]['status'], 200)

    def test_unrelated_out_of_window_and_invalid_records_are_excluded(self):
        for raw in [LOG.replace('19:28:', '18:28:'), LOG.replace("method: 'POST'", "method: 'GET'"), LOG.replace('/matches', '/analyze'), LOG.replace('2026-10-29', '2026-99-99'), LOG.replace('statusCode: 500', 'statusCode: 999')]:
            self.assertEqual(WINDOW.matching_http_rows(raw, START, END), [])

    def test_metadata_history_is_bounded(self):
        self.assertEqual(len(WINDOW.matching_http_rows(('\n' + LOG) * 35, START, END)), 20)

    def test_status_is_saved_before_api_recreation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            record_path = root / 'result.json'
            record_path.write_text(json.dumps({'status': 'OPEN', 'expiresAt': END, 'original': ['docker', 'compose', 'fixture']}))
            calls = []
            def recreate(args, timeout=40):
                saved = json.loads(record_path.read_text())
                self.assertEqual(saved['matchingResponseCapture'], 'CAPTURED')
                self.assertEqual(saved['matchingResponses'][0]['status'], 500)
                calls.append(args)
                return ''
            log_result = subprocess.CompletedProcess([], 0, LOG, '')
            with patch.object(WINDOW, 'WORK', root), patch.object(WINDOW, 'RECORD', record_path), patch.object(WINDOW, 'inspect', return_value={'Config': {'Env': [WINDOW.FLAG + '=8']}}), patch.object(WINDOW, 'verify_runtime'), patch.object(WINDOW, 'ready'), patch.object(WINDOW, 'run', side_effect=recreate), patch.object(WINDOW.subprocess, 'run', return_value=log_result), patch.object(WINDOW.time, 'time', return_value=END), contextlib.redirect_stdout(io.StringIO()):
                WINDOW.restore('test-attempt')
            saved = json.loads(record_path.read_text())
            self.assertEqual(saved['status'], 'RESTORED')
            self.assertEqual(len(calls), 1)

    def test_diagnostic_failure_does_not_block_original_quota_restoration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            record_path = root / 'result.json'
            record_path.write_text(json.dumps({'status': 'OPEN', 'expiresAt': END, 'original': ['docker', 'compose', 'fixture']}))
            with patch.object(WINDOW, 'WORK', root), patch.object(WINDOW, 'RECORD', record_path), patch.object(WINDOW, 'inspect', return_value={'Config': {'Env': [WINDOW.FLAG + '=8']}}), patch.object(WINDOW, 'verify_runtime'), patch.object(WINDOW, 'ready'), patch.object(WINDOW, 'run') as recreate, patch.object(WINDOW.subprocess, 'run', side_effect=TimeoutError('PRIVATE_DIAGNOSTIC')), contextlib.redirect_stdout(io.StringIO()):
                WINDOW.restore('test-deadline')
            saved = json.loads(record_path.read_text())
            self.assertEqual(saved['matchingResponseCapture'], 'UNAVAILABLE')
            self.assertEqual(saved['status'], 'RESTORED')
            recreate.assert_called_once()
            self.assertNotIn('PRIVATE', json.dumps(saved))

    def test_original_approval_boundary_is_preserved(self):
        self.assertEqual(int(WINDOW.AFTER) - WINDOW.COUNTER, 1)
        source = SOURCE.read_text()
        for forbidden in ['api.openai.com', 'OPENAI_API_KEY', 'UPDATE ', 'DELETE ', 'INSERT ', 'TRUNCATE ']:
            self.assertNotIn(forbidden, source)
        self.assertIn('BEGIN READ ONLY', source)


if __name__ == '__main__':
    unittest.main()
