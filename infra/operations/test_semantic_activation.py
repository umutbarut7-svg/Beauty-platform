"""Offline safety checks for the one-time owner-approved matching operation."""
import contextlib
import copy
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / '.github/operations/preview-commands.sh'
SOURCE = SCRIPT.read_text().split("python3 - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
DEFINITIONS = SOURCE.rsplit('\ntry:\n    main()', 1)[0]


class ActivationTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}
        exec(compile(DEFINITIONS, str(SCRIPT), 'exec'), self.ns)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name)
        self.ns['ROOT'] = root
        self.ns['WORK'] = root / 'operation'
        self.containers = {}
        for service in ['api', 'worker', 'postgres', 'gateway', 'admin', 'prepare-secrets']:
            values = {**self.ns['EXPECTED'], 'MVP_SEMANTIC_ENABLED': 'false', 'PHOTO_RETENTION': 'preserve-me'}
            self.containers[service] = {
                'Id': service + '-original', 'Image': service + '-image', 'RestartCount': 0,
                'State': {'Running': True, 'StartedAt': 'original', 'Health': {'Status': 'healthy'}},
                'HostConfig': {'Memory': 123, 'CapDrop': ['ALL']},
                'Config': {'Env': [k + '=' + v for k, v in values.items()], 'Cmd': [service], 'Entrypoint': ['bootstrap'], 'User': '1000', 'WorkingDir': '/app', 'Labels': {'com.docker.compose.config-hash': service + '-hash'}},
            }
        self.initial = copy.deepcopy(self.containers)
        self.commands = []
        self.failure = None
        self.pending = False
        self.candidate_drift = False
        self.hash_drift = False
        self.ns['compose'] = lambda c: ['compose', c['Config']['Cmd'][0]]
        self.ns['inspect'] = lambda name: copy.deepcopy(self.containers[name.removeprefix('beauty-preview-').removesuffix('-1')])
        self.ns['snapshot'] = lambda: copy.deepcopy(self.containers)
        self.ns['ready'] = lambda: None
        self.ns['wait_ready'] = lambda: None
        self.ns['sql'] = lambda query: '1' if self.pending else '0'
        self.ns['run'] = self.run_command

    def run_command(self, args, timeout=40):
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps([{'Id': args[3]}])
        service = args[1]
        if '--hash' in args:
            return service + ' ' + ('changed' if self.hash_drift else service + '-hash')
        enabled = '-f' in args
        if 'config' in args:
            values = self.ns['env'](self.initial[service])
            values['MVP_SEMANTIC_ENABLED'] = 'true' if enabled else 'false'
            config = {'image': service + '-image', 'environment': values}
            if enabled and self.candidate_drift:
                config['command'] = ['unexpected-change']
            return json.dumps({'services': {service: config}})
        self.assertIn('up', args)
        self.assertIn('--no-deps', args)
        self.assertIn('--no-build', args)
        self.assertEqual(args[args.index('--pull') + 1], 'never')
        self.commands.append((service, enabled))
        self.containers[service]['Id'] += '-recreated'
        values = self.ns['env'](self.containers[service])
        values['MVP_SEMANTIC_ENABLED'] = 'true' if enabled else 'false'
        self.containers[service]['Config']['Env'] = [k + '=' + v for k, v in values.items()]
        if self.failure == service and enabled:
            raise self.ns['Stop']('Synthetic partial recreation failure')
        return ''

    def invoke(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.ns['main']()

    def test_activation_changes_only_two_services(self):
        self.invoke()
        self.assertEqual(self.commands, [('worker', True), ('api', True)])
        for service in ['postgres', 'gateway', 'admin', 'prepare-secrets']:
            self.assertEqual(self.initial[service], self.containers[service])
        record = json.loads((self.ns['WORK'] / 'result.json').read_text())
        self.assertEqual(record['status'], 'COMPLETED')
        self.assertEqual(record['paidRequestsStarted'], 0)
        self.assertNotEqual(record['rollback']['api'], record['rollback']['worker'])

    def test_completed_request_does_not_recreate_again(self):
        self.invoke()
        self.invoke()
        self.assertEqual(len(self.commands), 2)

    def test_partial_api_failure_rolls_back_both_in_reverse_order(self):
        self.failure = 'api'
        with self.assertRaisesRegex(self.ns['Stop'], 'rollback PASS'):
            self.invoke()
        self.assertEqual(self.commands, [('worker', True), ('api', True), ('api', False), ('worker', False)])
        for service in ['api', 'worker']:
            self.assertEqual(self.ns['env'](self.initial[service]), self.ns['env'](self.containers[service]))

    def test_queued_jobs_prevent_activation(self):
        self.pending = True
        with self.assertRaisesRegex(self.ns['Stop'], 'Pending semantic jobs'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_config_hash_drift_prevents_activation(self):
        self.hash_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'Compose inputs differ'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_overlay_drift_prevents_activation(self):
        self.candidate_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'more than the semantic flag'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_model_or_quota_drift_prevents_activation(self):
        self.containers['api']['Config']['Env'].append('OPENAI_EMBEDDING_MODEL=unexpected-model')
        with self.assertRaisesRegex(self.ns['Stop'], 'settings drift'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_changed_image_rejected(self):
        current = copy.deepcopy(self.initial['api'])
        current['Image'] = 'unexpected-image'
        with self.assertRaisesRegex(self.ns['Stop'], 'image changed'):
            self.ns['verify_changed'](self.initial['api'], current, 'false')

    def test_runtime_environment_drift_rejected(self):
        current = copy.deepcopy(self.initial['api'])
        current['Config']['Env'].append('PHOTO_RETENTION=changed')
        with self.assertRaisesRegex(self.ns['Stop'], 'environment drift'):
            self.ns['verify_changed'](self.initial['api'], current, 'false')

    def test_failed_record_cannot_be_replayed(self):
        self.failure = 'api'
        with self.assertRaises(self.ns['Stop']):
            self.invoke()
        count = len(self.commands)
        with self.assertRaisesRegex(self.ns['Stop'], 'do not resend'):
            self.invoke()
        self.assertEqual(len(self.commands), count)


if __name__ == '__main__':
    unittest.main()
