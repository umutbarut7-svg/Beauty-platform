"""Offline checks for the API-only consultation recovery publication."""
import contextlib
import copy
import hashlib
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name('publish-preview-consultation-recovery.sh')
SOURCE = SCRIPT.read_text().split("python3 - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
DEFINITIONS = SOURCE.rsplit('\ntry:\n    main()', 1)[0]

class CatalogPublicationTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}
        exec(compile(DEFINITIONS, str(SCRIPT), 'exec'), self.ns)
        self.ns['IMAGE'] = 'sha256:' + 'b' * 64
        self.ns['STARTED'] = self.ns['time'].monotonic()
        self.ns['endpoint_guard'] = lambda: None
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name)
        self.ns['ROOT'] = root
        self.ns['WORK'] = root / 'operation'
        self.candidate = 'sha256:' + 'c' * 64
        self.containers = {}
        for service in ['api', 'worker', 'postgres', 'gateway', 'admin', 'prepare-secrets']:
            self.containers[service] = {
                'Id': service + '-original',
                'Image': self.ns['IMAGE'] if service == 'api' else service + '-image',
                'RestartCount': 0,
                'State': {'Running': True, 'StartedAt': 'original', 'Health': {'Status': 'healthy'}},
                'Config': {
                    'Env': [k + '=' + v for k, v in {**self.ns['EXPECTED_FLAGS'], 'PHOTO_RETENTION': 'keep'}.items()],
                    'Cmd': [service], 'Entrypoint': ['bootstrap'], 'User': '1000', 'WorkingDir': '/application',
                    'Labels': {'com.docker.compose.config-hash': 'api-hash'},
                },
                'HostConfig': {'Memory': 384, 'CapDrop': ['ALL']},
            }
        self.initial = copy.deepcopy(self.containers)
        self.commands = []
        self.failure = None
        self.config_drift = False
        self.hash_drift = False
        self.ns['compose'] = lambda c: ['compose']
        self.ns['inspect'] = lambda name: copy.deepcopy(self.containers[name.removeprefix('beauty-preview-').removesuffix('-1')])
        self.ns['snapshot'] = lambda: copy.deepcopy(self.containers)
        self.ns['ready'] = lambda: None
        self.ns['wait_ready'] = self.wait_ready
        self.ns['verify_module'] = self.verify_module
        self.ns['build'] = lambda c: (self.candidate, 'synthetic-digest')
        self.ns['run'] = self.run_command

    def wait_ready(self):
        if self.failure == 'health' and self.containers['api']['Image'] == self.candidate:
            raise self.ns['Stop']('synthetic unhealthy image')

    def verify_module(self, digest):
        if self.failure == 'digest' and self.containers['api']['Image'] == self.candidate:
            raise self.ns['Stop']('synthetic module mismatch')

    def run_command(self, args, timeout=40):
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps([{'Id': self.ns['IMAGE']}])
        if '--hash' in args:
            return 'api ' + ('drift' if self.hash_drift else 'api-hash')
        proposed = '-f' in args
        if 'config' in args:
            config = {'services': {'api': {'image': self.candidate if proposed else 'base-tag', 'environment': {'MVP_SEMANTIC_ENABLED': 'true'}}, 'worker': {'image': 'worker-tag'}}}
            if proposed and self.config_drift:
                config['services']['worker']['image'] = 'changed-worker'
            return json.dumps(config)
        self.assertIn('up', args)
        self.assertIn('--no-deps', args)
        self.assertIn('--no-build', args)
        self.assertEqual(args[args.index('--pull') + 1], 'never')
        self.commands.append(proposed)
        api = self.containers['api']
        api['Id'] += '-recreated'
        api['Image'] = self.candidate if proposed else self.ns['IMAGE']
        if self.failure == 'partial' and proposed:
            raise self.ns['Stop']('synthetic partial recreation')
        if self.failure == 'unrelated' and proposed:
            self.containers['worker']['Id'] = 'unexpected-worker'
        return ''

    def invoke(self):
        with contextlib.redirect_stdout(io.StringIO()):
            self.ns['apply']()

    def record(self):
        return json.loads((self.ns['WORK'] / 'result.json').read_text())

    def test_success_recreates_only_api_and_retains_rollback(self):
        self.invoke()
        self.assertEqual(self.commands, [True])
        self.assertEqual(self.record()['status'], 'COMPLETED')
        self.assertEqual(self.record()['providerRequestsStarted'], 0)
        self.assertEqual(self.record()['rollback'], ['compose'])
        self.assertEqual(self.ns['env'](self.initial['api']), self.ns['env'](self.containers['api']))
        for service in set(self.initial) - {'api'}:
            self.assertEqual(self.initial[service], self.containers[service])

    def test_completed_operation_does_not_recreate_again(self):
        self.invoke()
        self.invoke()
        self.assertEqual(self.commands, [True])

    def test_partial_recreation_failure_restores_original_image(self):
        self.failure = 'partial'
        with self.assertRaisesRegex(self.ns['Stop'], 'rollback PASS'):
            self.invoke()
        self.assertEqual(self.commands, [True, False])
        self.assertEqual(self.containers['api']['Image'], self.ns['IMAGE'])
        self.assertEqual(self.record()['status'], 'ROLLED_BACK')

    def test_failed_health_acceptance_rolls_back(self):
        self.failure = 'health'
        with self.assertRaisesRegex(self.ns['Stop'], 'rollback PASS'):
            self.invoke()
        self.assertEqual(self.commands, [True, False])

    def test_wrong_module_digest_rolls_back(self):
        self.failure = 'digest'
        with self.assertRaisesRegex(self.ns['Stop'], 'rollback PASS'):
            self.invoke()
        self.assertEqual(self.commands, [True, False])

    def test_non_api_compose_change_blocks_publication(self):
        self.config_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'more than the API image'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_original_compose_input_drift_blocks_publication(self):
        self.hash_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'Compose input drift'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_changed_baseline_image_is_rejected(self):
        self.containers['api']['Image'] = 'unexpected'
        with self.assertRaisesRegex(self.ns['Stop'], 'image drift'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_changed_model_or_limit_is_rejected(self):
        self.containers['api']['Config']['Env'].append('MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT=200')
        with self.assertRaisesRegex(self.ns['Stop'], 'feature/model/quota drift'):
            self.invoke()
        self.assertEqual(self.commands, [])

    def test_failed_operation_cannot_be_replayed(self):
        self.failure = 'health'
        with self.assertRaises(self.ns['Stop']):
            self.invoke()
        count = len(self.commands)
        with self.assertRaisesRegex(self.ns['Stop'], 'do not replay'):
            self.invoke()
        self.assertEqual(len(self.commands), count)

    def test_unrelated_service_change_is_reported_for_review(self):
        self.failure = 'unrelated'
        with self.assertRaisesRegex(self.ns['Stop'], 'NEEDS REVIEW'):
            self.invoke()
        self.assertEqual(self.record()['status'], 'ROLLBACK_NEEDS_REVIEW')

    def test_runtime_secret_or_settings_changes_are_rejected(self):
        changed = copy.deepcopy(self.initial['api'])
        changed['Config']['Env'].append('PHOTO_RETENTION=changed')
        with self.assertRaisesRegex(self.ns['Stop'], 'environment changed'):
            self.ns['verify_runtime'](self.initial['api'], changed, self.ns['IMAGE'])

    def test_build_failure_cannot_recreate_the_api(self):
        def failed_build(original):
            raise self.ns['Stop']('Synthetic offline compilation failure')
        self.ns['build'] = failed_build
        with self.assertRaisesRegex(self.ns['Stop'], 'offline compilation failure'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertEqual(self.containers, self.initial)

    def test_preparation_deadline_prevents_recreation(self):
        self.ns['STARTED'] -= 301
        with self.assertRaisesRegex(self.ns['Stop'], 'rollback PASS'):
            self.invoke()
        self.assertEqual(self.commands, [])
        self.assertEqual(self.containers, self.initial)


class PinnedSourceTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}
        exec(compile(DEFINITIONS, str(SCRIPT), 'exec'), self.ns)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.ns['CATALOG_RESULT'] = self.root / 'catalog.json'
        self.record = {
            'status': 'COMPLETED', 'previous': self.ns['ORIGINAL_IMAGE'],
            'image': 'sha256:' + 'a' * 64, 'moduleSha256': '1' * 64,
        }
        self.ns['run'] = lambda args: '1' * 64

    def save_record(self):
        self.ns['CATALOG_RESULT'].write_text(json.dumps(self.record))

    def test_completed_catalog_baseline_is_reused(self):
        self.save_record()
        self.assertEqual(self.ns['load_baseline'](), self.record['image'])

    def test_incomplete_prior_publication_is_rejected(self):
        self.record['status'] = 'PREPARED'
        self.save_record()
        with self.assertRaisesRegex(self.ns['Stop'], 'not completed'):
            self.ns['load_baseline']()

    def test_catalog_module_drift_is_rejected(self):
        self.save_record()
        self.ns['run'] = lambda args: '2' * 64
        with self.assertRaisesRegex(self.ns['Stop'], 'catalog module drift'):
            self.ns['load_baseline']()

    def test_unexpected_baseline_lineage_is_rejected(self):
        self.record['previous'] = 'sha256:' + 'b' * 64
        self.save_record()
        with self.assertRaisesRegex(self.ns['Stop'], 'not completed'):
            self.ns['load_baseline']()

    def test_verified_source_is_written_without_execution(self):
        data = b'// synthetic TypeScript only\n'
        digest = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        target = self.root / 'source.ts'
        with patch('urllib.request.urlopen', return_value=io.BytesIO(data)):
            self.ns['download']('pinned-ref', 'visual.service', digest, target)
        self.assertEqual(target.read_bytes(), data)

    def test_wrong_source_digest_cannot_be_written(self):
        target = self.root / 'source.ts'
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'wrong-source')):
            with self.assertRaisesRegex(self.ns['Stop'], 'integrity mismatch'):
                self.ns['download']('pinned-ref', 'visual.service', '0' * 40, target)
        self.assertFalse(target.exists())

    def test_oversized_source_cannot_be_written(self):
        target = self.root / 'source.ts'
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'x' * 64001)):
            with self.assertRaisesRegex(self.ns['Stop'], 'size exceeded'):
                self.ns['download']('pinned-ref', 'visual.service', '0' * 40, target)
        self.assertFalse(target.exists())

    def test_digest_verification_rejects_an_unexpected_module_set(self):
        with self.assertRaisesRegex(self.ns['Stop'], 'manifest mismatch'):
            self.ns['verify_module']({'unexpected-module': '0' * 64})


if __name__ == '__main__':
    unittest.main()




