"""Check asset integrity and fail-closed preparation without a running service."""
import importlib.util
import json
import pathlib
import shutil
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('orzell', ROOT / 'scripts/prepare-orzell-mobile.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.mobile = self.root / 'application/apps/mobile'
        self.mobile.mkdir(parents=True)
        self.app = '<Text style={styles.eyebrow}>EPIFIZ · ÖN İZLEME</Text>\nconst existingBooking = true;\n'
        (self.mobile / 'App.tsx').write_text(self.app)
        self.config = {'expo': {'name': 'EPIFIZ', 'slug': 'beauty-platform', 'android': {'package': 'dev.epifiz.preview'}, 'ios': {'bundleIdentifier': 'dev.epifiz.preview'}}}
        (self.mobile / 'app.json').write_text(json.dumps(self.config))

    def test_prepares_original_bytes_and_preserves_identifiers(self):
        module.prepare(self.root / 'application')
        self.assertEqual((self.mobile / 'assets/orzell-original-reference.jpg').read_bytes(), (ROOT / 'assets/brand/orzell/orzell-original-reference.jpg').read_bytes())
        actual = json.loads((self.mobile / 'app.json').read_text())
        expected = self.config | {'expo': self.config['expo'] | {'name': 'ORZELL'}}
        self.assertEqual(actual, expected)
        self.assertIn('const existingBooking = true;', (self.mobile / 'App.tsx').read_text())

    def test_drift_rejected_without_writing_assets(self):
        (self.mobile / 'App.tsx').write_text('unknown preview source')
        with self.assertRaisesRegex(ValueError, 'source drift'):
            module.prepare(self.root / 'application')
        self.assertFalse((self.mobile / 'assets').exists())
        self.assertEqual(json.loads((self.mobile / 'app.json').read_text()), self.config)

    def test_tampered_original_rejected_without_writes(self):
        harness = self.root / 'harness'
        for name in ['config/brand', 'assets/brand/orzell']:
            shutil.copytree(ROOT / name, harness / name)
        (harness / 'assets/brand/orzell/orzell-original-reference.jpg').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            module.prepare(self.root / 'application', harness)
        self.assertEqual((self.mobile / 'App.tsx').read_text(), self.app)
        self.assertFalse((self.mobile / 'assets').exists())


if __name__ == '__main__':
    unittest.main()
