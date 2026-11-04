"""Behavior checks for the approved publisher; no cloud, database or Docker calls."""
import copy
import hashlib
import importlib.util
import io
import json
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


pub = load('publication_under_test', 'publish-catalog-b2b.py')
dispatch = load('dispatch_under_test', 'dispatch-catalog-b2b.py')


class ConfigurationTests(unittest.TestCase):
    def test_resume_requires_pre_service_failure_and_unchanged_schema(self):
        commands = {'api': ['original-api'], 'worker': ['original-worker']}
        record = {'status': 'PREPARATION_FAILED', 'source': pub.SOURCE, 'previous': pub.PREVIOUS, 'image': pub.API_IMAGE, 'rollback': commands}
        state = {'columns': pub.FIELDS, 'tables': [], 'migrations': [{'name': 'historical', 'finished': True}]}
        pub.validate_preparation_resume(record, commands, state)
        for status in ['MIGRATING', 'UPGRADING_WORKER', 'UPGRADING_API', 'COMPLETED', 'ROLLBACK_NEEDS_REVIEW']:
            with self.assertRaises(pub.Stop):
                pub.validate_preparation_resume({**record, 'status': status}, commands, state)
        with self.assertRaises(pub.Stop):
            pub.validate_preparation_resume(record, commands, {'columns': [], 'tables': [], 'migrations': state['migrations']})
        with self.assertRaises(pub.Stop):
            pub.validate_preparation_resume(record, {'api': ['drift'], 'worker': ['original-worker']}, state)

    def test_only_selected_image_can_change(self):
        before = {'services': {'api': {'image': 'old', 'environment': {'QUOTA': '5'}}, 'worker': {'image': 'old-worker'}}}
        after = copy.deepcopy(before)
        after['services']['api']['image'] = pub.API_IMAGE
        pub.validate_delta(before, after, 'api', pub.API_IMAGE)
        after['services']['api']['environment']['QUOTA'] = '50'
        with self.assertRaises(pub.Stop):
            pub.validate_delta(before, after, 'api', pub.API_IMAGE)

    def test_only_two_reviewed_migrations_are_pending(self):
        state = {'columns': pub.FIELDS, 'tables': [], 'migrations': [{'name': 'old', 'checksum': 'old-hash', 'finished': True}]}
        candidate = {'old': 'old-hash', **pub.MIGRATIONS}
        pub.validate_migrations(state, candidate)
        for changed in [{'old': 'drift', **pub.MIGRATIONS}, {**candidate, 'unexpected': 'x'}]:
            with self.assertRaises(pub.Stop):
                pub.validate_migrations(state, changed)
        state['migrations'][0]['finished'] = False
        with self.assertRaises(pub.Stop):
            pub.validate_migrations(state, candidate)

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
        evidence = {'source': pub.SOURCE, 'prismaVersion': '6.19.0', 'models': pub.MODELS, 'compiledInventoryAssertions': 10, 'compiledB2BAssertions': 8, 'providerRequests': 0, 'liveDeployment': False, 'modules': {name: 'a' * 64 for name in pub.MODULES}, 'isolatedDatabase': 'PASS'}
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
        artifact = {'id': dispatch.ARTIFACT, 'digest': dispatch.DIGEST, 'expired': False, 'size_in_bytes': 772034003, 'workflow_run': {'id': dispatch.RUN, 'head_sha': dispatch.HEAD}}
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


class CatalogActivationTests(unittest.TestCase):
    def test_dispatch_requires_successful_exact_source_gates_before_ssm(self):
        fixture = {'id': 123, 'head_sha': pub.SOURCE, 'status': 'completed', 'conclusion': 'success'}
        dispatch.validate_gate(fixture, 123, pub.SOURCE)
        for key, value in [('id', 124), ('head_sha', 'different'), ('status', 'in_progress'), ('conclusion', 'cancelled')]:
            with self.assertRaises(dispatch.Stop):
                dispatch.validate_gate({**fixture, key: value}, 123, pub.SOURCE)
        with patch.dict(dispatch.os.environ, {'GITHUB_REPOSITORY': dispatch.REPO, 'GITHUB_REF': 'refs/pull/91/merge'}), patch.object(dispatch, 'aws') as aws:
            with self.assertRaises(dispatch.Stop):
                dispatch.main()
            aws.assert_not_called()

    def test_api_can_activate_only_both_catalog_flags_and_exact_image(self):
        before = {'services': {'api': {'image': 'old', 'environment': {'QUOTA': '5'}}, 'worker': {'image': 'old-worker'}}}
        after = copy.deepcopy(before)
        after['services']['api']['image'] = pub.API_IMAGE
        after['services']['api']['environment'].update({flag: 'true' for flag in pub.FLAGS})
        pub.validate_delta(before, after, 'api', pub.API_IMAGE, activate=True)
        for flag in pub.FLAGS:
            bad = copy.deepcopy(after)
            bad['services']['api']['environment'][flag] = 'false'
            with self.assertRaises(pub.Stop):
                pub.validate_delta(before, bad, 'api', pub.API_IMAGE, activate=True)
        for field in ['QUOTA', 'MVP_AI_ENABLED', 'MVP_PHOTO_RETENTION_HOURS']:
            bad = copy.deepcopy(after)
            bad['services']['api']['environment'][field] = 'changed'
            with self.assertRaises(pub.Stop):
                pub.validate_delta(before, bad, 'api', pub.API_IMAGE, activate=True)

    def test_worker_or_unreviewed_settings_cannot_be_activated(self):
        before = {'services': {'worker': {'image': 'old', 'environment': {'MVP_INVENTORY_ENABLED': 'false'}}}}
        after = copy.deepcopy(before)
        after['services']['worker']['image'] = pub.API_IMAGE
        after['services']['worker']['environment'].update({flag: 'true' for flag in pub.FLAGS})
        with self.assertRaises(pub.Stop):
            pub.validate_delta(before, after, 'worker', pub.API_IMAGE, activate=True)

    def test_existing_catalog_table_or_privacy_drift_stops_publication(self):
        state = {'columns': pub.FIELDS, 'tables': [], 'migrations': [{'name': 'old', 'finished': True, 'checksum': 'old-hash'}]}
        candidate = {'old': 'old-hash', **pub.MIGRATIONS}
        for changed in [{**state, 'tables': [pub.MODELS[0]]}, {**state, 'columns': []}]:
            with self.assertRaises(pub.Stop):
                pub.validate_migrations(changed, candidate)
        bad = {**candidate}
        bad[next(iter(pub.MIGRATIONS))] = 'wrong-reviewed-digest'
        with self.assertRaises(pub.Stop):
            pub.validate_migrations(state, bad)

    def test_private_catalog_guards_are_reads_and_require_401(self):
        calls = []
        def deny(url, **kwargs):
            calls.append(url)
            raise pub.urllib.error.HTTPError(url, 401, 'unauthorized', {}, None)
        with patch.object(pub.urllib.request, 'urlopen', side_effect=deny):
            pub.private_guard()
        self.assertEqual(len(calls), 3)
        self.assertTrue(any('/products' in path for path in calls))
        self.assertTrue(any('/b2b/profile' in path for path in calls))
        self.assertTrue(all('/analyze' not in path and '/refresh' not in path for path in calls))
        with patch.object(pub.urllib.request, 'urlopen', side_effect=pub.urllib.error.HTTPError('fixture', 403, 'wrong', {}, None)):
            with self.assertRaises(pub.Stop):
                pub.private_guard()

    def test_actual_reviewed_source_fits_private_envelope(self):
        source = (Path(__file__).parent / 'publish-catalog-b2b.py').read_bytes()
        script = dispatch.envelope(source, 'synthetic-private-transfer')
        self.assertLessEqual(len(script), 24000)
        self.assertNotIn('synthetic-private-transfer', script)
        self.assertEqual(dispatch.REQUEST['source'], pub.SOURCE)
        self.assertEqual(dispatch.REQUEST['artifact_id'], dispatch.ARTIFACT)


if __name__ == '__main__':
    unittest.main()
