"""Behavior checks for the code-only service publisher; no cloud, database or Docker calls."""
import copy
import hashlib
import importlib.util
import io
import json
import re
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pub = load('publication_under_test', 'publish-matching-refresh.py')
dispatch = load('dispatch_under_test', 'dispatch-matching-refresh.py')
# Read the independent image verifier: fixtures must not mirror a publisher typo.
verifier = Path(__file__).with_name('verify-matching-refresh-image.cjs').read_text()
rehearsed_block = verifier.split('for (const stem of [', 1)[1].split('])', 1)[0]
REHEARSED_MODULES = re.findall(r'"([^"]+)"', rehearsed_block)



class ConfigurationTests(unittest.TestCase):
    def test_publisher_requires_the_modules_in_the_actual_image_rehearsal(self):
        self.assertEqual(set(pub.MODULES), set(REHEARSED_MODULES))
        self.assertEqual(len(REHEARSED_MODULES), 8)

    def test_only_pre_mutation_failure_can_enable_repaired_preparation(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(pub, 'PREPARATION', Path(folder) / 'result.json'):
            prior = {'status': 'PREPARATION_FAILED', 'source': pub.SOURCE, 'image': pub.API_IMAGE, 'previous': pub.PREVIOUS, 'schemaChange': False}
            pub.PREPARATION.write_text(json.dumps(prior))
            pub.prior_preparation()
            for key, value in [('status', 'COMPLETED'), ('status', 'ROLLED_BACK'), ('source', 'different'), ('image', 'different'), ('schemaChange', True)]:
                pub.PREPARATION.write_text(json.dumps({**prior, key: value}))
                with self.assertRaises(pub.Stop):
                    pub.prior_preparation()

    def test_live_probes_check_read_and_refresh_without_credentials(self):
        import urllib.error
        seen = []
        def denied(request, **kwargs):
            seen.append((request.get_method(), request.full_url, request.data))
            raise urllib.error.HTTPError(request.full_url, 401, 'synthetic unauthorized', None, None)
        with patch.object(pub.urllib.request, 'urlopen', side_effect=denied):
            pub.private_guard()
        self.assertEqual([entry[0] for entry in seen], ['GET', 'POST'])
        self.assertTrue(seen[1][1].endswith('/unauthenticated-probe/matches/refresh'))
        self.assertEqual(seen[1][2], b'{}')
        for code in [403, 404, 500]:
            with patch.object(pub.urllib.request, 'urlopen', side_effect=urllib.error.HTTPError('synthetic', code, 'synthetic', None, None)):
                with self.assertRaises(pub.Stop):
                    pub.private_guard()

    def test_only_selected_image_can_change(self):
        before = {'services': {'api': {'image': 'old', 'environment': {'QUOTA': '5'}}, 'worker': {'image': 'old-worker'}}}
        after = copy.deepcopy(before)
        after['services']['api']['image'] = pub.API_IMAGE
        pub.validate_delta(before, after, 'api', pub.API_IMAGE)
        after['services']['api']['environment']['QUOTA'] = '50'
        with self.assertRaises(pub.Stop):
            pub.validate_delta(before, after, 'api', pub.API_IMAGE)

    def test_exact_existing_schema_required_without_pending_migrations(self):
        state = {'columns': pub.FIELDS, 'migrations': [{'name': pub.MIGRATION, 'checksum': pub.MIGRATION_SHA, 'finished': True}]}
        candidate = {pub.MIGRATION: pub.MIGRATION_SHA}
        pub.validate_migrations(state, candidate)
        for changed in [{pub.MIGRATION: 'drift'}, {**candidate, 'new_pending': 'x'}, {}]:
            with self.assertRaises(pub.Stop):
                pub.validate_migrations(state, changed)
        for changed in [{'columns': [], 'migrations': state['migrations']}, {'columns': pub.FIELDS, 'migrations': [{**state['migrations'][0], 'finished': False}]}]:
            with self.assertRaises(pub.Stop):
                pub.validate_migrations(changed, candidate)

    def test_existing_publication_cannot_be_blindly_replayed(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(pub, 'WORK', Path(folder)), patch.object(pub, 'run') as run:
            with self.assertRaises(pub.Stop):
                pub.publish('https://example.blob.core.windows.net/private')
            run.assert_not_called()

    def test_unrelated_service_restart_is_detected(self):
        before = {'api': {'Id': 'a', 'Image': 'i', 'RestartCount': 0, 'State': {'StartedAt': 't'}}, 'postgres': {'Id': 'p', 'Image': 'p', 'RestartCount': 0, 'State': {'StartedAt': 't'}}}
        after = copy.deepcopy(before)
        after['postgres']['RestartCount'] = 1
        with self.assertRaises(pub.Stop):
            pub.verify_others(before, after, {'api', 'worker'})


class RollbackTests(unittest.TestCase):
    def check(self, attempted):
        calls = []
        worker_image = pub.API_IMAGE if attempted else pub.PREVIOUS['worker']
        def inspect(name):
            return {'Image': pub.PREVIOUS['api'] if name.endswith('api-1') else worker_image, 'State': {'Running': True}}
        with patch.object(pub, 'recreate', side_effect=lambda command, service: calls.append(service)), patch.object(pub, 'inspect', side_effect=inspect), patch.object(pub, 'wait_ready'), patch.object(pub, 'snapshot', return_value={}), patch.object(pub, 'verify_others'):
            state = pub.rollback({'api': ['original-api'], 'worker': ['original-worker']}, {}, attempted)
        return calls, state

    def test_before_candidate_api_original_worker_can_be_restored(self):
        calls, state = self.check(False)
        self.assertEqual(calls, ['worker', 'api'])
        self.assertEqual(state, 'ROLLED_BACK')

    def test_after_candidate_api_new_privacy_worker_is_retained(self):
        calls, state = self.check(True)
        self.assertEqual(calls, ['api'])
        self.assertEqual(state, 'API_ROLLED_BACK_NEW_PRIVACY_WORKER_RETAINED')

    def test_api_is_reverted_even_if_new_cleaner_needs_review(self):
        with patch.object(pub, 'recreate') as recreate, patch.object(pub, 'inspect', return_value={'Image': pub.PREVIOUS['worker'], 'State': {'Running': False}}):
            with self.assertRaises(pub.Stop):
                pub.rollback({'api': ['original-api'], 'worker': ['original-worker']}, {}, True)
            recreate.assert_called_once_with(['original-api'], 'api')


class ArtifactTests(unittest.TestCase):
    def package(self, extra=False, corrupt=False):
        tar = b'synthetic-image-bytes'
        manifest = {'source': pub.SOURCE, 'images': {'api': pub.API_IMAGE, 'migrate': pub.MIGRATE_IMAGE}, 'archive': {'name': 'images.tar.gz', 'bytes': len(tar), 'sha256': hashlib.sha256(tar).hexdigest()}, 'rehearsal': 'PASS', 'liveDeployment': False, 'providerRequests': 0}
        evidence = {'source': pub.SOURCE, 'prismaVersion': '6.19.0', 'matchingFields': pub.FIELDS, 'modules': {name: 'a' * 64 for name in REHEARSED_MODULES}, 'isolatedDatabase': 'PASS', 'compiledCompatibilityAssertions': 6, 'compiledRefreshAssertions': 3}
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('images.tar.gz', tar if not corrupt else b'changed-image-bytes!!')
            archive.writestr('release.json', json.dumps(manifest))
            archive.writestr('api-evidence.json', json.dumps(evidence))
            archive.writestr('worker-evidence.json', json.dumps(evidence))
            if extra:
                archive.writestr('../escape', 'unexpected')
        return tar, buffer.getvalue(), evidence

    def run_download(self, extra=False, corrupt=False):
        tar, data, evidence = self.package(extra, corrupt)
        calls = []
        def run(args, **kwargs):
            calls.append(args)
            return json.dumps([{'Id': args[-1]}]) if args[:3] == ['docker', 'image', 'inspect'] else ''
        with tempfile.TemporaryDirectory() as folder, patch.object(pub, 'WORK', Path(folder)), patch.object(pub, 'ZIP_SIZE', len(data)), patch.object(pub, 'ZIP_SHA', hashlib.sha256(data).hexdigest()), patch.object(pub, 'TAR_SIZE', len(tar)), patch.object(pub, 'TAR_SHA', hashlib.sha256(tar).hexdigest()), patch.object(pub.urllib.request, 'urlopen', return_value=io.BytesIO(data)), patch.object(pub, 'run', side_effect=run):
            result = pub.download_package('https://test.blob.core.windows.net/fixed-synthetic-artifact')
            self.assertEqual(result, evidence)
        return calls

    def test_exact_artifact_loads_only_verified_images(self):
        calls = self.run_download()
        self.assertEqual(calls[0][:2], ['docker', 'load'])
        self.assertEqual(len(calls), 3)

    def test_extra_archive_entry_rejected(self):
        with self.assertRaises(pub.Stop):
            self.run_download(extra=True)

    def test_changed_image_bytes_rejected(self):
        with self.assertRaises(pub.Stop):
            self.run_download(corrupt=True)

    def test_transfer_cannot_use_other_hosts_or_cleartext(self):
        for url in ['http://test.blob.core.windows.net/file', 'https://attacker.example/file', 'https://user:secret@test.blob.core.windows.net/file']:
            with self.assertRaises(pub.Stop):
                pub.download_package(url)

    def test_portable_hash_and_verified_existing_package_need_no_redownload(self):
        tar, data, evidence = self.package()
        def run(args, **kwargs):
            return json.dumps([{'Id': args[-1]}]) if args[:3] == ['docker', 'image', 'inspect'] else ''
        with tempfile.TemporaryDirectory() as folder, patch.object(pub, 'WORK', Path(folder)), patch.object(pub, 'ZIP_SIZE', len(data)), patch.object(pub, 'ZIP_SHA', hashlib.sha256(data).hexdigest()), patch.object(pub, 'TAR_SIZE', len(tar)), patch.object(pub, 'TAR_SHA', hashlib.sha256(tar).hexdigest()), patch.object(pub.urllib.request, 'urlopen', return_value=io.BytesIO(data)) as download, patch.object(pub, 'run', side_effect=run), patch.object(hashlib, 'file_digest', None, create=True):
            self.assertEqual(pub.download_package('https://test.blob.core.windows.net/file'), evidence)
            self.assertEqual(pub.download_package('https://test.blob.core.windows.net/file'), evidence)
            self.assertEqual(download.call_count, 1)


class DispatchTests(unittest.TestCase):
    def test_pinned_artifact_and_rehearsal_required(self):
        artifact = {'id': dispatch.ARTIFACT, 'digest': dispatch.DIGEST, 'expired': False, 'size_in_bytes': dispatch.ZIP_SIZE, 'workflow_run': {'id': dispatch.RUN, 'head_sha': dispatch.HEAD}}
        run = {'id': dispatch.RUN, 'head_sha': dispatch.HEAD, 'status': 'completed', 'conclusion': 'success'}
        dispatch.validate_artifact(artifact, run)
        for key, value in [('expired', True), ('digest', 'changed')]:
            changed = copy.deepcopy(artifact)
            changed[key] = value
            with self.assertRaises(dispatch.Stop):
                dispatch.validate_artifact(changed, run)
        run['conclusion'] = 'failure'
        with self.assertRaises(dispatch.Stop):
            dispatch.validate_artifact(artifact, run)

    def test_private_envelope_executes_exact_source_with_url_hidden(self):
        source = b"assert TRANSFER_URL == 'synthetic-private-transfer'\nprint('synthetic envelope PASS')\n"
        script = dispatch.envelope(source, 'synthetic-private-transfer')
        self.assertNotIn('synthetic-private-transfer', script)
        self.assertLessEqual(len(script), 24000)
        import subprocess
        result = subprocess.run(['bash', '-se'], input=script, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn('synthetic envelope PASS', result.stdout)


class PublicationSequenceTests(unittest.TestCase):
    def exercise(self, fail=None):
        from contextlib import ExitStack
        calls, rollback_calls = [], []
        with tempfile.TemporaryDirectory() as folder, ExitStack() as stack:
            root = Path(folder)
            marker = root / 'matching-one-approved-test-20261029'
            marker.mkdir()
            (marker / 'result.json').write_text('{"status":"RESTORED"}')
            stack.enter_context(patch.object(pub, 'ROOT', root))
            stack.enter_context(patch.object(pub, 'prior_preparation'))
            stack.enter_context(patch.object(pub, 'WORK', root / 'new-release'))
            stack.enter_context(patch.object(pub.shutil, 'disk_usage', return_value=type('Disk', (), {'free': 16 * 1024**3})()))
            before = {service: {'Image': pub.PREVIOUS[service], 'Config': {'Env': ['MVP_AI_DAILY_REQUEST_LIMIT=5', 'MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT=20'], 'Labels': {'com.docker.compose.config-hash': 'hash'}}} for service in ['api', 'worker']}
            state = {'columns': pub.FIELDS, 'migrations': [{'name': pub.MIGRATION, 'checksum': pub.MIGRATION_SHA, 'finished': True}]}
            stack.enter_context(patch.object(pub, 'snapshot', return_value=before))
            stack.enter_context(patch.object(pub, 'ready'))
            stack.enter_context(patch.object(pub, 'queue_empty'))
            stack.enter_context(patch.object(pub, 'compose', side_effect=lambda container: ['compose', 'api' if container is before['api'] else 'worker']))
            def run(args, **kwargs):
                calls.append(args)
                if args[:3] == ['docker', 'image', 'inspect']:
                    return json.dumps([{'Id': args[-1]}])
                if args[-2:] == ['--hash', args[1]]:
                    return 'hash'
                if args[-3:] == ['config', '--format', 'json']:
                    return json.dumps({'services': {args[1]: {'image': pub.PREVIOUS[args[1]]}}})
                return ''
            stack.enter_context(patch.object(pub, 'run', side_effect=run))
            stack.enter_context(patch.object(pub, 'schema_state', return_value=state))
            stack.enter_context(patch.object(pub, 'download_package', return_value={'modules': {}}))
            stack.enter_context(patch.object(pub, 'migration_manifest', return_value={pub.MIGRATION: pub.MIGRATION_SHA}))
            if fail == 'preparation':
                stack.enter_context(patch.object(pub, 'validate_migrations', side_effect=pub.Stop('schema drift')))
            stack.enter_context(patch.object(pub, 'overlay', side_effect=lambda command, baseline, service, image: (['candidate', service], {'services': {service: {'image': image}}})))
            stack.enter_context(patch.object(pub, 'verify_others'))
            stack.enter_context(patch.object(pub, 'recreate', side_effect=lambda command, service: calls.append(['recreate', service])))
            worker_effect = pub.Stop('worker not healthy') if fail == 'worker' else None
            stack.enter_context(patch.object(pub, 'worker_ready', side_effect=worker_effect))
            stack.enter_context(patch.object(pub, 'wait_ready'))
            stack.enter_context(patch.object(pub, 'inspect', return_value={}))
            stack.enter_context(patch.object(pub, 'verify_runtime', side_effect=pub.Stop('runtime drift') if fail == 'api' else None))
            stack.enter_context(patch.object(pub, 'verify_modules'))
            stack.enter_context(patch.object(pub, 'private_guard'))
            stack.enter_context(patch.object(pub, 'rollback', side_effect=lambda commands, original, attempted: rollback_calls.append(attempted) or 'TEST_ROLLBACK'))
            stack.enter_context(patch('builtins.print'))
            if fail:
                with self.assertRaises(pub.Stop):
                    pub.publish('synthetic-private-transfer')
            else:
                pub.publish('synthetic-private-transfer')
            record = json.loads((pub.WORK / 'result.json').read_text())
        return calls, rollback_calls, record

    def test_success_never_runs_a_migration_and_updates_worker_before_api(self):
        calls, rollbacks, record = self.exercise()
        self.assertEqual([call for call in calls if call[0] == 'recreate'], [['recreate', 'worker'], ['recreate', 'api']])
        self.assertFalse(any('migrate' in call for call in calls))
        self.assertEqual(rollbacks, [])
        self.assertEqual(record['status'], 'COMPLETED')
        self.assertIs(record['schemaChange'], False)

    def test_preparation_failure_does_not_stop_or_recreate_services(self):
        calls, rollbacks, record = self.exercise('preparation')
        self.assertFalse(any('stop' in call or 'recreate' in call for call in calls))
        self.assertEqual(rollbacks, [])
        self.assertEqual(record['status'], 'PREPARATION_FAILED')

    def test_worker_failure_rolls_back_before_candidate_api(self):
        calls, rollbacks, record = self.exercise('worker')
        self.assertEqual(rollbacks, [False])
        self.assertNotIn(['recreate', 'api'], calls)

    def test_api_verification_failure_requires_new_privacy_worker_retention(self):
        calls, rollbacks, record = self.exercise('api')
        self.assertEqual(rollbacks, [True])
        self.assertIn(['recreate', 'api'], calls)


if __name__ == '__main__':
    unittest.main()
