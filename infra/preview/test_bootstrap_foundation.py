import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('preview_foundation', HERE / 'bootstrap-foundation.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class FoundationSafetyTests(unittest.TestCase):
    def test_plan_never_contacts_aws(self):
        with patch.object(bootstrap, 'aws', side_effect=AssertionError('Unexpected AWS call')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bootstrap.main([]), 0)

    def test_wrong_account_stops_before_any_change(self):
        with patch.object(bootstrap.shutil, 'which', return_value='/usr/bin/aws'):
            with patch.object(bootstrap, 'aws', return_value={'Account': '000000000000'}) as client:
                with self.assertRaises(bootstrap.SetupError):
                    bootstrap.main(['--apply'])
                self.assertEqual(client.call_args_list[0].args, ('sts', 'get-caller-identity'))
                self.assertEqual(client.call_count, 1)

    def test_existing_stack_is_never_updated_or_replaced(self):
        replies = [{'Account': bootstrap.ACCOUNT}, {'Stacks': [{'StackStatus': 'CREATE_COMPLETE'}]}]
        with patch.object(bootstrap.shutil, 'which', return_value='/usr/bin/aws'):
            with patch.object(bootstrap, 'aws', side_effect=replies) as client:
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(bootstrap.main(['--apply']), 0)
                self.assertEqual(client.call_count, 2)

    def test_changed_resource_or_destructive_plan_is_rejected(self):
        changes = [{'ResourceChange': {'LogicalResourceId': name, 'Action': 'Add', 'ResourceType': value['Type']}}
                   for name, value in bootstrap.STACK['Resources'].items()]
        bootstrap.validate_changes(changes)
        for action in ['Modify', 'Remove']:
            altered = copy.deepcopy(changes)
            altered[0]['ResourceChange']['Action'] = action
            with self.assertRaises(bootstrap.SetupError):
                bootstrap.validate_changes(altered)
        with self.assertRaises(bootstrap.SetupError):
            bootstrap.validate_changes(changes[:-1])

    def test_secret_goes_through_stdin_and_aws_error_is_sanitized(self):
        secret = 'test-only-value-never-a-real-secret'
        def execute(command, **options):
            self.assertNotIn(secret, ' '.join(command))
            self.assertEqual(json.loads(options['input'])['Value'], secret)
            return bootstrap.subprocess.CompletedProcess(command, 1, '', secret)
        with patch.object(bootstrap.subprocess, 'run', side_effect=execute):
            with self.assertRaises(bootstrap.SetupError) as failure:
                bootstrap.aws('ssm', 'put-parameter', document={'Value': secret})
            self.assertNotIn(secret, str(failure.exception))

    def test_embedded_template_matches_reviewed_yaml(self):
        import yaml
        self.assertEqual(bootstrap.STACK, yaml.safe_load((HERE / 'stack.yml').read_text()))


if __name__ == '__main__':
    unittest.main()
