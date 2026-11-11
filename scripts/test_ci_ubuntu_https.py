import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('ci_https', Path(__file__).with_name('ci-ubuntu-https.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class MirrorTests(unittest.TestCase):
    def test_existing_mirrors_change_without_touching_signature_or_other_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            mirror = root / MODULE.FILES[0]
            mirror.parent.mkdir(parents=True)
            mirror.write_text('http://azure.archive.ubuntu.com/ubuntu\nhttps://archive.ubuntu.com/ubuntu/\n')
            sources = root / MODULE.FILES[2]
            sources.parent.mkdir(parents=True)
            sources.write_text('URIs: http://security.ubuntu.com/ubuntu/\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n')
            third_party = root / 'etc/apt/sources.list.d/vendor.list'
            third_party.write_text('deb http://vendor.example.test/ubuntu noble main\n')
            self.assertEqual(MODULE.secure_sources(root), 2)
            self.assertEqual(mirror.read_text(), 'https://azure.archive.ubuntu.com/ubuntu\nhttps://archive.ubuntu.com/ubuntu/\n')
            self.assertIn('Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg', sources.read_text())
            self.assertEqual(third_party.read_text(), 'deb http://vendor.example.test/ubuntu noble main\n')
            self.assertEqual(MODULE.secure_sources(root), 0)

    def test_no_new_sources_or_security_bypasses_are_added(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(MODULE.secure_sources(root), 0)
            self.assertEqual(list(root.iterdir()), [])
        original = 'http://azure.archive.ubuntu.com.evil.test/ubuntu/ http://archive.ubuntu.com/other/'
        self.assertEqual(MODULE.PATTERN.sub(r'https://\1', original), original)

if __name__ == '__main__':
    unittest.main()
