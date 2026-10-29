"""Offline failure and rollback tests; never connects to Docker, AWS or a DB."""
import contextlib
import copy
import io
import json
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).with_name('publish-preview-catalog-bindings.sh')
SOURCE = SCRIPT.read_text().split("python3 - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
DEFINITIONS = SOURCE.rsplit('\ntry:\n    main()', 1)[0]


class CatalogPublicationTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}
        exec(compile(DEFINITIONS, str(SCRIPT), 'exec'), self.ns)
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
            self.ns['main']()

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

    def test_patch_changes_only_the_missing_projection(self):
        before = '// immutable prefix\n' + self.ns['EXPECTED_METHOD'] + '\n    async bookings() {}\n// immutable suffix\n'
        after = self.ns['patch_source'](before)
        addition = '                        locations: { select: { locationId: true } },\n'
        self.assertEqual(after.replace(addition, '', 1), before)
        self.assertEqual(after.count(addition), 1)

    def test_source_drift_is_rejected_before_patching(self):
        before = self.ns['EXPECTED_METHOD'].replace('isPublic: true', 'isPublic: false') + '\nasync bookings() {}'
        with self.assertRaisesRegex(self.ns['Stop'], 'source drift'):
            self.ns['patch_source'](before)

    def test_guarded_contract_probe_rejects_old_method_and_accepts_fixed_method(self):
        legacy = self.ns['EXPECTED_METHOD']
        fixed = self.ns['patch_source'](legacy + '\nasync bookings() {}').split('\nasync bookings()', 1)[0]
        for method, expected in [(legacy, 1), (fixed, 0)]:
            probe = self.ns['PROBE'].replace(
                "const {MvpService} = require('/application/dist/mvp/mvp.service.js');",
                "const common_1={NotFoundException:class extends Error{getStatus(){return 404}}};\nconst MvpService=class{" + method + "};",
            ).replace(
                "const {Prisma} = require('/application/node_modules/@prisma/client');",
                "const Prisma={dmmf:{datamodel:{models:[{name:'Staff',fields:[{name:'locations',type:'StaffLocation'}]},{name:'StaffLocation',fields:[{name:'locationId'}]}]}}};",
            )
            result = subprocess.run(['node', '-e', probe], capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, expected, result.stderr)


class CandidateBuildTests(unittest.TestCase):
    def setUp(self):
        self.ns = {}
        exec(compile(DEFINITIONS, str(SCRIPT), 'exec'), self.ns)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = pathlib.Path(self.temp.name)
        self.ns['WORK'] = self.work
        self.calls = []
        self.source = self.ns['EXPECTED_METHOD'] + '\nasync bookings() {}'
        self.base_drift = False
        self.metadata_drift = False
        self.base = {'Id': self.ns['IMAGE'], 'Config': {'User': 'node', 'Entrypoint': ['bootstrap']}, 'RootFS': {'Layers': ['base-layer']}}
        self.ns['run'] = self.run_command
        self.ns['inspect'] = lambda name: {'State': {'ExitCode': 0}}

    def run_command(self, args, timeout=40):
        self.calls.append(args)
        if args[:2] == ['docker', 'cp'] and args[2].endswith(self.ns['MODULE']):
            content = self.source + ('// drift' if self.base_drift and 'offline' in args[2] else '')
            pathlib.Path(args[3]).write_text(content)
        if args[:3] == ['docker', 'image', 'inspect']:
            if args[3] == self.ns['IMAGE']:
                return json.dumps([self.base])
            candidate = copy.deepcopy(self.base)
            candidate['Id'] = 'candidate-image'
            candidate['RootFS']['Layers'].append('catalog-copy')
            if self.metadata_drift:
                candidate['Config']['User'] = 'root'
            return json.dumps([candidate])
        return ''

    def test_build_checks_base_bytes_and_uses_no_network(self):
        image, digest = self.ns['build']({'Image': self.ns['IMAGE']})
        self.assertEqual(image, 'candidate-image')
        self.assertEqual(len(digest), 64)
        for args in self.calls:
            if args[:2] in [['docker', 'create'], ['docker', 'build']]:
                self.assertEqual(args[args.index('--network') + 1], 'none')
        dockerfile = (self.work / 'Dockerfile').read_text()
        self.assertEqual(dockerfile.count('COPY'), 1)
        self.assertIn(self.ns['MODULE'], dockerfile)

    def test_live_writable_layer_drift_blocks_probe_and_build(self):
        self.base_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'differs from reviewed base'):
            self.ns['build']({'Image': self.ns['IMAGE']})
        self.assertFalse(any(args[:2] == ['docker', 'start'] for args in self.calls))
        self.assertFalse(any(args[:2] == ['docker', 'build'] for args in self.calls))
        self.assertTrue(any(args[:2] == ['docker', 'rm'] for args in self.calls))

    def test_candidate_process_metadata_drift_is_rejected(self):
        self.metadata_drift = True
        with self.assertRaisesRegex(self.ns['Stop'], 'process metadata changed'):
            self.ns['build']({'Image': self.ns['IMAGE']})


if __name__ == '__main__':
    unittest.main()
