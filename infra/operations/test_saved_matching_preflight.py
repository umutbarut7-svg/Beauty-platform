"""Exercise the preflight with process doubles, never a live host/provider."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / '.github/operations/saved-matching-preflight.sh'
REAL_RUN = subprocess.run


def load():
    source = SCRIPT.read_text().split("python3 - <<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
    namespace = {'__name__': 'preflight_test'}
    exec(compile(source, str(SCRIPT), 'exec'), namespace)
    return namespace


class PreflightTest(unittest.TestCase):
    def setUp(self):
        self.ns = load()
        self.commands = []
        self.failed_migrations = 0
        self.healthy = True
        self.response = {'modules': {name: 'a' * 64 for name in self.ns['MODULES']}, 'prismaVersion': '6.19.0', 'matchingFields': []}

    def command(self, args, **kwargs):
        self.commands.append(args)
        if args[:2] == ['docker', 'inspect']:
            service = 'api' if args[2].endswith('api-1') else 'worker'
            info = {'Image': 'sha256:' + 'b' * 64, 'State': {'Running': True, 'Health': {'Status': 'healthy' if self.healthy else 'unhealthy'}}, 'Config': {'Env': ['OPENAI_API_KEY=private-sentinel', 'MVP_AI_DAILY_REQUEST_LIMIT=5'], 'Labels': {'com.docker.compose.project': 'beauty-preview', 'com.docker.compose.service': service, 'com.docker.compose.project.working_dir': '/opt/epifiz/application', 'com.docker.compose.project.config_files': '/opt/epifiz/application/compose.yml', 'com.docker.compose.project.environment_file': '/opt/epifiz/preview.env'}}}
            output = json.dumps([info])
        elif args[:3] == ['docker', 'exec', 'beauty-preview-postgres-1']:
            self.assertIn('BEGIN READ ONLY;', args[-1])
            self.assertNotRegex(args[-1], r'(?i)\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b')
            output = json.dumps({'matchingColumns': [], 'migrationApplied': False, 'failedMigrations': self.failed_migrations})
        elif args[:2] == ['docker', 'exec'] and args[3:5] == ['node', '-e']:
            REAL_RUN(['node', '--check', '-'], input=args[-1], text=True, capture_output=True, check=True)
            self.assertNotIn('new PrismaClient', args[-1])
            output = json.dumps(self.response)
        else:
            self.fail('Unexpected process operation')
        return subprocess.CompletedProcess(args, 0, output, '')

    def run_main(self):
        output = io.StringIO()
        with patch.object(self.ns['subprocess'], 'run', side_effect=self.command), patch.object(self.ns['pathlib'].Path, 'is_file', return_value=True), patch.object(self.ns['pathlib'].Path, 'is_symlink', return_value=False), patch.object(self.ns['pathlib'].Path, 'stat') as stat, patch.object(self.ns['pathlib'].Path, 'read_text', return_value='{"status":"RESTORED"}'), patch.object(self.ns['urllib'].request, 'urlopen') as urlopen, contextlib.redirect_stdout(output):
            stat.return_value.st_size = 100
            response = urlopen.return_value.__enter__.return_value
            response.status = 200
            response.headers = {'Access-Control-Allow-Origin': 'https://preview.13-51-112-228.sslip.io'}
            self.ns['main']()
        return output.getvalue()

    def test_healthy_baseline_reads_metadata_without_exposing_secret(self):
        text = self.run_main()
        report = json.loads(text.splitlines()[0])
        self.assertEqual(report['schema']['matchingColumns'], [])
        self.assertEqual(report['priorPaidWindow'], 'RESTORED')
        self.assertIn('READ_ONLY_COMPLETE', text)
        self.assertNotIn('private-sentinel', text)
        self.assertNotIn('OPENAI_API_KEY', text)
        self.assertEqual(len(self.commands), 5)

    def test_unhealthy_api_stops_before_exec(self):
        self.healthy = False
        with self.assertRaises(RuntimeError):
            self.run_main()
        self.assertEqual(len(self.commands), 1)

    def test_failed_migration_blocks_continuation(self):
        self.failed_migrations = 1
        with self.assertRaises(RuntimeError):
            self.run_main()

    def test_invalid_runtime_metadata_is_not_logged(self):
        self.response['modules']['visual.service'] = 'private-sentinel'
        with self.assertRaises(RuntimeError):
            self.run_main()


if __name__ == '__main__':
    unittest.main()
