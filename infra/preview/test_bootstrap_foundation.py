import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import boto3
from botocore.stub import Stubber, ANY

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('preview_foundation', HERE / 'bootstrap-foundation.py')
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


def client(service):
    return boto3.client(service, region_name=bootstrap.REGION,
                        aws_access_key_id='unit-test-only', aws_secret_access_key='unit-test-only')


def changes():
    return [{'ResourceChange': {'LogicalResourceId': name, 'Action': 'Add', 'ResourceType': value['Type']}}
            for name, value in bootstrap.STACK['Resources'].items()]


class FoundationSafetyTests(unittest.TestCase):
    def tearDown(self):
        bootstrap._clients.clear()

    def test_plan_never_contacts_aws(self):
        with patch.object(bootstrap, 'aws', side_effect=AssertionError('Unexpected AWS call')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bootstrap.main([]), 0)

    def test_wrong_account_stops_before_any_change(self):
        with patch.object(bootstrap, 'aws', return_value={'Account': '000000000000'}) as api:
            with self.assertRaises(bootstrap.SetupError):
                bootstrap.main(['--apply'])
            self.assertEqual(api.call_args_list[0].args, ('sts', 'get-caller-identity'))
            self.assertEqual(api.call_count, 1)

    def test_existing_stack_is_never_updated_or_replaced(self):
        replies = [{'Account': bootstrap.ACCOUNT}, {'Stacks': [{'StackStatus': 'CREATE_COMPLETE'}]}]
        with patch.object(bootstrap, 'aws', side_effect=replies) as api:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bootstrap.main(['--apply']), 0)
            self.assertEqual(api.call_count, 2)

    def test_changed_resource_or_destructive_plan_is_rejected(self):
        original = changes()
        bootstrap.validate_changes(original)
        for action in ['Modify', 'Remove']:
            altered = copy.deepcopy(original)
            altered[0]['ResourceChange']['Action'] = action
            with self.assertRaises(bootstrap.SetupError):
                bootstrap.validate_changes(altered)
        with self.assertRaises(bootstrap.SetupError):
            bootstrap.validate_changes(original[:-1])

    def test_secret_sdk_error_is_sanitized(self):
        secret = 'unit-test-only-secret-value'
        api = client('ssm')
        bootstrap._clients['ssm'] = api
        with Stubber(api) as stub:
            stub.add_client_error('put_parameter', service_error_code='AccessDeniedException',
                                  service_message=secret, expected_params={'Name':'/unit-test','Value':secret,'Type':'SecureString'})
            with self.assertRaises(bootstrap.SetupError) as failure:
                bootstrap.aws('ssm','put-parameter',document={'Name':'/unit-test','Value':secret,'Type':'SecureString'})
            self.assertNotIn(secret, str(failure.exception))
            self.assertIn('AccessDeniedException', str(failure.exception))

    def test_validate_template_uses_native_sdk_string(self):
        api=client('cloudformation')
        bootstrap._clients['cloudformation']=api
        template=json.dumps(bootstrap.STACK)
        with Stubber(api) as stub:
            stub.add_response('validate_template', {'Capabilities':['CAPABILITY_IAM']}, {'TemplateBody':template})
            self.assertEqual(bootstrap.aws('cloudformation','validate-template',document={'TemplateBody':template})['Capabilities'], ['CAPABILITY_IAM'])
            stub.assert_no_pending_responses()

    def test_permission_failure_is_not_treated_as_missing_stack(self):
        api=client('cloudformation')
        bootstrap._clients['cloudformation']=api
        with Stubber(api) as stub:
            stub.add_client_error('describe_stacks', service_error_code='AccessDenied', expected_params={'StackName':bootstrap.STACK_NAME})
            with self.assertRaises(bootstrap.SetupError):
                bootstrap.aws('cloudformation','describe-stacks',document={'StackName':bootstrap.STACK_NAME},allow_missing=True)

    def test_full_create_flow_has_no_secret_read_or_existing_resource_mutation(self):
        services={name:client(name) for name in ['sts','cloudformation','kms','ssm']}
        bootstrap._clients.update(services)
        keyarn='arn:aws:kms:eu-north-1:926642724499:key/11111111-1111-1111-1111-111111111111'
        changearn='arn:aws:cloudformation:eu-north-1:926642724499:changeSet/unit-test/11111111-1111-1111-1111-111111111111'
        with contextlib.ExitStack() as scope:
            stubs={name:scope.enter_context(Stubber(api)) for name,api in services.items()}
            stubs['sts'].add_response('get_caller_identity',{'Account':bootstrap.ACCOUNT},{})
            cfn=stubs['cloudformation']
            cfn.add_client_error('describe_stacks',service_error_code='ValidationError',service_message='Stack does not exist',expected_params={'StackName':bootstrap.STACK_NAME})
            stubs['kms'].add_response('describe_key',{'KeyMetadata':{'KeyId':keyarn.rsplit('/',1)[-1],'Arn':keyarn,'AWSAccountId':bootstrap.ACCOUNT,'KeyState':'Enabled'}},{'KeyId':'alias/aws/ssm'})
            cfn.add_response('validate_template',{'Capabilities':['CAPABILITY_IAM']},{'TemplateBody':json.dumps(bootstrap.STACK,separators=(',',':'))})
            secret='disposable-unit-test-value-never-a-live-secret'
            for name in bootstrap.PARAMETERS:
                stubs['ssm'].add_response('describe_parameters',{'Parameters':[]},{'ParameterFilters':[{'Key':'Name','Option':'Equals','Values':[name]}]})
                stubs['ssm'].add_response('put_parameter',{'Version':1},{'Name':name,'Type':'SecureString','Tier':'Standard','KeyId':'alias/aws/ssm','Value':secret,'Overwrite':False,'Tags':[{'Key':'Project','Value':'BeautyPlatformPreview'}]})
            cfn.add_response('create_change_set',{'Id':changearn},{'StackName':bootstrap.STACK_NAME,'ChangeSetName':ANY,'ChangeSetType':'CREATE','TemplateBody':json.dumps(bootstrap.STACK,separators=(',',':')),'Capabilities':['CAPABILITY_IAM'],'Parameters':[{'ParameterKey':'SsmKeyArn','ParameterValue':keyarn}],'Tags':[{'Key':'Project','Value':'BeautyPlatformPreview'}]})
            cfn.add_response('describe_change_set',{'Status':'CREATE_COMPLETE','Changes':changes()},{'ChangeSetName':changearn})
            cfn.add_response('execute_change_set',{}, {'ChangeSetName':changearn})
            output=io.StringIO()
            with patch.object(bootstrap.secrets,'token_urlsafe',return_value=secret),contextlib.redirect_stdout(output):
                self.assertEqual(bootstrap.main(['--apply']),0)
            self.assertNotIn(secret,output.getvalue())
            for stub in stubs.values():
                stub.assert_no_pending_responses()

    def test_embedded_template_matches_reviewed_yaml(self):
        import yaml
        self.assertEqual(bootstrap.STACK, yaml.safe_load((HERE / 'stack.yml').read_text()))


if __name__ == '__main__':
    unittest.main()
