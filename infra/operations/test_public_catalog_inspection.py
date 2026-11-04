import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('inspection', Path(__file__).with_name('inspect-public-catalog-index.py'))
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)
REAL_RUN = subprocess.run


class InspectionTests(unittest.TestCase):
    def setUp(self):
        self.commands = []
        self.rows = [{'businessName': 'Public fixture', 'serviceName': 'Saç kesimi', 'hasAnyIndex': False, 'hasModelIndex': False, 'freshModelIndex': False}, {'businessName': 'Public fixture', 'serviceName': 'Kaynak', 'hasAnyIndex': True, 'hasModelIndex': True, 'freshModelIndex': True}]
        self.model = 'text-embedding-3-small'
        self.image = inspection.IMAGE

    def process(self, args, **kwargs):
        self.commands.append(args)
        if args[:2] == ['docker', 'inspect']:
            data = [{'Image': self.image, 'State': {'Running': True, 'Health': {'Status': 'healthy'}}, 'Config': {'Env': ['OPENAI_API_KEY=private-sentinel', 'OPENAI_EMBEDDING_MODEL=' + self.model]}}]
        elif args[:3] == ['docker', 'exec', 'beauty-preview-postgres-1']:
            query = args[-1]
            self.assertIn('BEGIN READ ONLY;', query)
            self.assertNotRegex(query, r'(?i)\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|MvpPhotoAnalysis|MvpPhoto|User)\b')
            self.assertNotIn('v.embedding', query)
            self.assertNotIn('"embedding"', query)
            self.assertIn('b."isPublic"', query)
            self.assertIn('s."isBookable"', query)
            data = self.rows
        elif args[:5] == ['docker', 'exec', '-i', 'beauty-preview-api-1', 'node']:
            REAL_RUN(['node', '--check', '-'], input=args[-1], text=True, capture_output=True, check=True)
            self.assertNotIn('PrismaClient', args[-1])
            data = [{**row, 'cutCompatible': row['serviceName'] == 'Saç kesimi'} for row in self.rows]
        else:
            self.fail('Unexpected command')
        return subprocess.CompletedProcess(args, 0, json.dumps(data), '')

    def execute(self):
        output = io.StringIO()
        with patch.object(inspection.subprocess, 'run', side_effect=self.process), contextlib.redirect_stdout(output):
            inspection.main()
        return output.getvalue()

    def test_missing_cut_index_is_distinguished_from_wrong_service(self):
        text = self.execute()
        report = json.loads(text.splitlines()[0])
        self.assertEqual(report['cutCompatibleServices'], 1)
        self.assertEqual(report['freshIndexedCutServices'], 0)
        self.assertEqual(report['freshIndexedServices'], 1)
        self.assertNotIn('private-sentinel', text)
        self.assertEqual(len(self.commands), 3)

    def test_fresh_cut_index_is_reported_without_provider(self):
        self.rows[0].update(hasAnyIndex=True, hasModelIndex=True, freshModelIndex=True)
        report = json.loads(self.execute().splitlines()[0])
        self.assertEqual(report['freshIndexedCutServices'], 1)

    def test_source_drift_stops_before_database(self):
        self.image = 'sha256:' + '0' * 64
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertEqual(len(self.commands), 1)

    def test_unexpected_model_cannot_enter_sql(self):
        self.model = "untrusted'query"
        with self.assertRaises(RuntimeError):
            self.execute()
        self.assertEqual(len(self.commands), 1)

    def test_bounds_and_inconsistent_index_metadata_fail_closed(self):
        for rows in [self.rows * 101, [{**self.rows[0], 'freshModelIndex': True}], [{**self.rows[0], 'businessName': 'hidden\ncontent'}]]:
            with self.assertRaises(RuntimeError):
                inspection.validate_rows(rows)


if __name__ == '__main__':
    unittest.main()
