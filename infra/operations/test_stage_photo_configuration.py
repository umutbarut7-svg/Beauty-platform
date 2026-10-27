import io
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import stage_photo_configuration as stage


def candidate():
    env = {
        'MVP_AI_ENABLED': 'false',
        'MVP_PHOTO_POLICY_REVIEWED': 'false',
        'MVP_SEMANTIC_ENABLED': 'false',
        'MVP_PHOTO_POLICY_VERSION': 'orzell-photo-draft-1',
        'MVP_PHOTO_NOTICE': 'A bounded notice for the isolated test.',
        'MVP_PHOTO_RETENTION_HOURS': '24',
        'MVP_PHOTO_AUDIT_RETENTION_DAYS': '90',
    }
    return {'services': {name: {'environment': dict(env)} for name in ['api', 'worker']}}


class SafetyTests(unittest.TestCase):
    def test_plan_needs_no_docker_or_network_and_writes_no_runtime_files(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / 'candidate.json'
            path.write_text(json.dumps(candidate()))
            result = subprocess.run(
                [sys.executable, str(pathlib.Path(stage.__file__)), '--candidate', str(path)],
                capture_output=True, text=True, env={'PATH': ''}, timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertIn('PLAN ONLY', result.stdout)
            self.assertEqual(list(pathlib.Path(folder).iterdir()), [path])

    def test_activation_mismatch_and_credential_fields_are_rejected(self):
        for field, value in [('MVP_AI_ENABLED', 'true'), ('MVP_PHOTO_POLICY_REVIEWED', 'true'), ('MVP_PHOTO_RETENTION_HOURS', '48'), ('OPENAI_API_KEY', 'not-a-key')]:
            with self.subTest(field=field):
                item = candidate()
                for name in ['api', 'worker']:
                    item['services'][name]['environment'][field] = value
                with self.assertRaises(ValueError):
                    stage.validate_candidate(item)
        item = candidate()
        item['services']['api']['environment']['MVP_PHOTO_NOTICE'] += ' drift'
        with self.assertRaises(ValueError):
            stage.validate_candidate(item)

    def test_no_credential_environment_is_ever_exported(self):
        item = {'Config': {'Env': ['STAGE33_MVP_ENABLED=true', 'AWS_SESSION_TOKEN=fixture-not-a-credential']}}
        with self.assertRaises(RuntimeError):
            stage.environment(item)

    def test_runtime_path_escape_is_rejected(self):
        for raw in ['/etc/passwd', '/opt/epifiz/../../etc/passwd', 'relative-file']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                stage.checked_path(raw)

    def exercise_apply(self, fail_api=False, concurrent=False):
        settings = stage.validate_candidate(candidate())
        env = {'STAGE33_MVP_ENABLED': 'true', 'MVP_AI_ENABLED': 'false', 'MVP_PHOTO_POLICY_REVIEWED': 'false', 'MVP_SEMANTIC_ENABLED': 'false'}
        before = {s: {'Id': s + '-old', 'Image': stage.EXPECTED_IMAGE[s]} for s in ['api', 'worker']}
        plans = {s: (before[s], ['docker', 'compose', '--env-file', s + '-own.env', '-f', s + '-own.yml'], dict(env)) for s in ['api', 'worker']}
        calls, checked = [], []
        def inspect(name):
            if name in before:
                value = dict(before[name])
                if concurrent and name == 'api':
                    value['Id'] = 'concurrent-release'
                return value
            return {'Id': name + '-unchanged'}
        def run(args, timeout=30):
            calls.append(args)
            return ''
        failed = False
        def verify(name, expected):
            nonlocal failed
            checked.append((name, expected))
            if fail_api and name == 'api' and not failed:
                failed = True
                raise RuntimeError('Simulated failed API readiness')
        class Reply:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *_): pass
        with tempfile.TemporaryDirectory() as folder, patch.object(stage, 'inspect', side_effect=inspect), patch.object(stage, 'run', side_effect=run), patch.object(stage, 'verify_service', side_effect=verify), patch.object(stage.urllib.request, 'urlopen', return_value=Reply()), patch('sys.stdout', new_callable=io.StringIO) as output:
            if fail_api or concurrent:
                with self.assertRaises(RuntimeError):
                    stage.apply_staging(plans, pathlib.Path(folder), settings)
                self.assertIn('Rollback verification: PASS', output.getvalue())
            else:
                stage.apply_staging(plans, pathlib.Path(folder), settings)
                for name in ['api', 'worker']:
                    staged = json.loads((pathlib.Path(folder) / (name + '.json')).read_text())
                    self.assertEqual(staged['services'][name]['image'], stage.EXPECTED_IMAGE[name])
                    self.assertEqual(staged['services'][name]['environment'], settings)
                    self.assertEqual(checked[['worker', 'api'].index(name)], (name, {**env, **settings}))
                self.assertIn('gates remain FALSE', output.getvalue())
        for args in calls:
            service = args[-1]
            self.assertIn(service, ['api', 'worker'])
            self.assertIn(service + '-own.env', args)
            self.assertIn(service + '-own.yml', args)
            self.assertEqual(args[-7:], ['up', '-d', '--no-deps', '--pull', 'never', '--no-build', service])
            for required in ['--no-deps', '--no-build', '--pull', 'never']:
                self.assertIn(required, args)
        return calls, checked

    def test_each_service_keeps_its_own_sources_and_image(self):
        calls, _ = self.exercise_apply()
        self.assertEqual([args[-1] for args in calls], ['worker', 'api'])

    def test_failed_api_health_rolls_back_api_and_worker(self):
        calls, checked = self.exercise_apply(fail_api=True)
        self.assertEqual([args[-1] for args in calls], ['worker', 'api', 'api', 'worker'])
        self.assertNotIn('MVP_PHOTO_NOTICE', checked[-1][1])

    def test_concurrent_api_replacement_is_not_overwritten(self):
        calls, _ = self.exercise_apply(concurrent=True)
        self.assertEqual([args[-1] for args in calls], ['worker', 'worker'])


if __name__ == '__main__':
    unittest.main()
