"""No-provider tests for a single approved opportunity and safe observation."""
import contextlib
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location('controlled_matching', ROOT / 'controlled-matching-test.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SOURCE = (ROOT / 'matching-test-window.py').read_text()


class ControlledMatchingTests(unittest.TestCase):
    def test_current_usage_leaves_exactly_one_opportunity(self):
        for used in [5, 12, 19]:
            candidate = MODULE.materialize(SOURCE, used)
            namespace = {'__name__': 'offline_fixture'}
            exec(compile(candidate, 'fixture', 'exec'), namespace)
            self.assertEqual(namespace['COUNTER'], used)
            self.assertEqual(int(namespace['AFTER']) - used, 1)
            self.assertEqual(namespace['BEFORE'], '5')
            self.assertEqual(namespace['WORK'], MODULE.WORK)
            self.assertTrue(namespace['UNIT'].endswith('-second'))
            self.assertIn('preserve_matching_responses(record)', candidate)

    def test_global_cap_is_not_expanded(self):
        for used in [0, 4, 20, 21, -1, True, '12']:
            with self.assertRaises(MODULE.Stop):
                MODULE.materialize(SOURCE, used)

    def test_source_drift_is_rejected(self):
        with self.assertRaises(MODULE.Stop):
            MODULE.materialize(SOURCE.replace("BEFORE, COUNTER, AFTER = '5', 7, '8'", 'drift = True'), 12)

    def test_result_projection_keeps_only_safe_metadata(self):
        record = {'status': 'RESTORED', 'bucket': 'PRIVATE_OWNER_HASH', 'original': ['PRIVATE_INPUT'], 'matchingResponseCapture': 'CAPTURED', 'matchingResponses': [{'timestamp': '2026-10-29T20:01:02Z', 'method': 'POST', 'route': 'visual/sessions/:sessionId/matches', 'status': 200, 'body': 'PRIVATE_BODY', 'key': 'PRIVATE_KEY'}]}
        result = MODULE.public_result(record)
        self.assertEqual(result['responses'][0]['status'], 200)
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertEqual(set(result['responses'][0]), {'timestamp', 'method', 'route', 'status'})

    def test_unrestored_result_is_not_success(self):
        for state in ['OPEN', 'PREPARED', 'UNKNOWN']:
            with self.assertRaises(MODULE.Stop):
                MODULE.public_result({'status': state})

    def test_invalid_and_private_rows_are_not_emitted(self):
        for row in [{'timestamp': 'PRIVATE', 'method': 'POST', 'route': 'visual/sessions/:sessionId/matches', 'status': 200}, {'timestamp': '2026-10-29T20:01:02Z', 'method': 'POST', 'route': 'PRIVATE_SESSION', 'status': 200}, {'timestamp': '2026-10-29T20:01:02Z', 'method': 'POST', 'route': 'visual/sessions/:sessionId/matches', 'status': 999}]:
            self.assertEqual(MODULE.public_result({'status': 'RESTORED', 'matchingResponses': [row]})['responses'], [])

    def test_observation_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / 'result.json').write_text('{"status":"RESTORED","matchingResponseCapture":"UNAVAILABLE"}')
            out = io.StringIO()
            with patch.object(MODULE, 'WORK', root), patch.object(MODULE.subprocess, 'run') as command, patch.object(MODULE.urllib.request, 'urlopen') as network, contextlib.redirect_stdout(out):
                MODULE.observe()
            command.assert_not_called()
            network.assert_not_called()
            self.assertIn('CONTROLLED_MATCHING_RESULT', out.getvalue())
            self.assertIn('UNAVAILABLE', out.getvalue())

    def test_does_not_introduce_provider_or_database_writes(self):
        text = (ROOT / 'controlled-matching-test.py').read_text()
        for forbidden in ['api.openai.com', 'OPENAI_API_KEY', 'UPDATE ', 'INSERT ', 'DELETE ', 'TRUNCATE ']:
            self.assertNotIn(forbidden, text)


if __name__ == '__main__':
    unittest.main()
