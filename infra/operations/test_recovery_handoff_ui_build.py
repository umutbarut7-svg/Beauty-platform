import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("page_builder", Path(__file__).with_name("build-recovery-handoff-ui.py"))
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class HandoffPageBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="public-handoff-page-")
        self.addCleanup(self.temp.cleanup)
        self.output = Path(self.temp.name)/"preview.html"

    def test_review_is_default_and_each_inline_source_matches_its_csp_hash(self):
        report = BUILDER.build(self.output)
        html = self.output.read_text()
        self.assertEqual(report["status"], "REVIEW_ONLY_PAGE_BUILT")
        self.assertFalse(report["realKeyIntakeEnabled"])
        self.assertIn("const syntheticPreviewEnabled = false;", html)
        for pattern in (r'<script type="module">(.*?)</script>', r'<style>(.*?)</style>'):
            body = re.search(pattern, html, re.S).group(1)
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            self.assertIn("'sha256-"+digest+"'", html)
        for directive in ("connect-src 'none'", "form-action 'none'", "base-uri 'none'", "worker-src 'none'"):
            self.assertIn(directive, html)
        self.assertNotIn("unsafe-inline", html)
        self.assertNotIn("@@", html)
        self.assertEqual(hashlib.sha256(self.output.read_bytes()).hexdigest(), report["htmlSha256"])

    def test_synthetic_mode_has_no_production_activation_and_does_not_overwrite(self):
        report = BUILDER.build(self.output, synthetic=True)
        before = self.output.read_bytes()
        self.assertEqual(report["status"], "SYNTHETIC_FIXTURE_PAGE_BUILT")
        self.assertFalse(report["realKeyIntakeEnabled"])
        self.assertIn(b"const syntheticPreviewEnabled = true;", before)
        self.assertIn(b'SYNTHETIC_ONLY', before)
        with self.assertRaises(FileExistsError):
            BUILDER.build(self.output)
        self.assertTrue(self.output.read_bytes() == before)
        target = Path(self.temp.name)/"link.html"
        target.symlink_to(self.output)
        with self.assertRaises(FileExistsError):
            BUILDER.build(target)
        self.assertTrue(self.output.read_bytes() == before)

    def test_output_is_reproducible_and_mode_is_explicit(self):
        first = BUILDER.build(self.output)
        second = BUILDER.build(Path(self.temp.name)/"second.html")
        self.assertEqual(first["htmlSha256"], second["htmlSha256"])
        with self.assertRaisesRegex(ValueError, "EXPLICIT_PREVIEW_MODE_REQUIRED"):
            BUILDER.build(Path(self.temp.name)/"wrong.html", synthetic="true")

    def test_cli_no_action_and_unsupported_arguments_do_not_echo_values(self):
        script = str(Path(__file__).with_name("build-recovery-handoff-ui.py"))
        for args, code in (([], 0), (["--enable-real", "never-read"], 2)):
            result = subprocess.run([sys.executable, script, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, code)
            self.assertFalse(json.loads(result.stdout)["realKeyIntakeEnabled"])
            self.assertNotIn("never-read", result.stdout+result.stderr)


if __name__ == "__main__":
    unittest.main()
