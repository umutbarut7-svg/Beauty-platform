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


pub = load('publication_under_test', 'publish-saved-matching.py')
dispatch = load('dispatch_under_test', 'dispatch-saved-matching-release.py')


class ConfigurationTests(unittest.TestCase):
    def test_only_selected_image_can_change(self):
        before = {'services': {'api': {'image': 'old', 'environment': {'QUOTA': '5'}}, 'worker': {'image': 'old-worker'}}}
        after = copy.deepcopy(before)
        after['services']['api']['image'] = pub.API_IMAGE
        pub.validate_delta(before, after, 'api', pub.API_IMAGE)
        after['services']['api']['environment']['QUOTA'] = '50'
        with self.assertRaises(pub.Stop):
            pub.validate_delta(before, after, 'api', pub.API_IMAGE)

    def test_only_one_reviewed_migration_is_pending(self):
        state = {'columns': [], 'migrations': [{'name': 'old', 'checksum': 'old-hash', 'finished': True}]}
        candidate = {'old': 'old-hash', pub.MIGRATION: pub.MIGRATION_SHA}
        pub.validate_migrations(state, candidate)
        for changed in [{'old': 'drift', pub.MIGRATION: pub.MIGRATION_SHA}, {**candidate, 'unexpected': 'x'}]:
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
        evidence = {'source': pub.SOURCE, 'prismaVersion': '6.19.0', 'matchingFields': pub.FIELDS, 'modules': {name: 'a' * 64 for name in pub.MODULES}, 'isolatedDatabase': 'PASS'}
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


class DispatchTests(unittest.TestCase):
    def test_pinned_artifact_and_rehearsal_required(self):
        artifact = {'id': dispatch.ARTIFACT, 'digest': dispatch.DIGEST, 'expired': False, 'size_in_bytes': 771720992, 'workflow_run': {'id': dispatch.RUN, 'head_sha': dispatch.HEAD}}
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


if __name__ == '__main__':
    unittest.main()
