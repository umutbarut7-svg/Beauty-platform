import copy
import importlib.util
import json
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location('infra_audit', HERE / 'audit-recovery-infrastructure.py')
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class Fake:
    def __init__(self):
        module = runpy.run_path(str(HERE / 'plan-recovery-host.py'))
        module['template'].__globals__['INSTANCE'] = 't3.small'
        self.template = module['template']()
        self.stack = f'arn:aws:cloudformation:{AUDIT.REGION}:{AUDIT.ACCOUNT}:stack/{AUDIT.STACK}/fixture-uuid'
        self.ami = 'ami-1234567890abcdef0'
        self.host = 'i-1234567890abcdef0'
        self.ids = {key: 'fixture-' + key for key in AUDIT.TYPES}
        self.ids.update(RecoveryHost=self.host, Network='vpc-12345678', Subnet='subnet-12345678',
                        Firewall='sg-12345678', Routes='rtb-12345678', Internet='igw-12345678')
        self.role_arn = f'arn:aws:iam::{AUDIT.ACCOUNT}:role/{self.ids["SessionRole"]}'
        self.profile_arn = f'arn:aws:iam::{AUDIT.ACCOUNT}:instance-profile/{self.ids["SessionProfile"]}'
        self.calls = []
        self.replies = {
            ('sts', 'get-caller-identity'): {'Account': AUDIT.ACCOUNT},
            ('cloudformation', 'describe-stacks'): {'Stacks': [{'StackId': self.stack, 'StackName': AUDIT.STACK,
                'StackStatus': 'CREATE_COMPLETE', 'Parameters': [{'ParameterKey': 'AmiId', 'ParameterValue': self.ami}]}]},
            ('cloudformation', 'get-template'): {'TemplateBody': self.template},
            ('cloudformation', 'list-stack-resources'): {'StackResourceSummaries': [
                {'LogicalResourceId': key, 'ResourceType': value, 'ResourceStatus': 'CREATE_COMPLETE',
                 'PhysicalResourceId': self.ids[key]} for key, value in AUDIT.TYPES.items()]},
            ('ec2', 'describe-instances'): {'Reservations': [{'Instances': [{'InstanceId': self.host,
                'State': {'Name': 'running'}, 'InstanceType': 't3.small', 'ImageId': self.ami,
                'Tags': [{'Key': 'Project', 'Value': 'ORZELLRecoveryRehearsal'}, {'Key': 'DataScope', 'Value': 'SyntheticOnly'},
                         {'Key': 'aws:cloudformation:stack-id', 'Value': self.stack}],
                'VpcId': self.ids['Network'], 'SubnetId': self.ids['Subnet'], 'SecurityGroups': [{'GroupId': self.ids['Firewall']}],
                'MetadataOptions': {'State': 'applied', 'HttpEndpoint': 'enabled', 'HttpTokens': 'required', 'HttpPutResponseHopLimit': 1},
                'NetworkInterfaces': [{'Attachment': {'DeleteOnTermination': True, 'DeviceIndex': 0}}],
                'BlockDeviceMappings': [{'DeviceName': '/dev/xvda', 'Ebs': {'VolumeId': 'vol-12345678', 'DeleteOnTermination': True}}],
                'IamInstanceProfile': {'Arn': self.profile_arn}}]}]},
            ('ec2', 'describe-instance-attribute'): {'InstanceId': self.host, 'InstanceInitiatedShutdownBehavior': {'Value': 'terminate'}},
            ('ec2', 'describe-instance-credit-specifications'): {'InstanceCreditSpecifications': [{'InstanceId': self.host, 'CpuCredits': 'standard'}]},
            ('ec2', 'describe-volumes'): {'Volumes': [{'VolumeId': 'vol-12345678', 'Encrypted': True, 'Size': 20, 'VolumeType': 'gp3',
                'Iops': 3000, 'Throughput': 125, 'Attachments': [{'InstanceId': self.host, 'Device': '/dev/xvda', 'State': 'attached'}]}]},
            ('ec2', 'describe-security-groups'): {'SecurityGroups': [{'GroupId': self.ids['Firewall'], 'VpcId': self.ids['Network'],
                'IpPermissions': [], 'IpPermissionsEgress': [{'IpProtocol': 'tcp', 'FromPort': 443, 'ToPort': 443,
                                                           'IpRanges': [{'CidrIp': '0.0.0.0/0'}]}]}]},
            ('ec2', 'describe-route-tables'): {'RouteTables': [{'RouteTableId': self.ids['Routes'], 'VpcId': self.ids['Network'],
                'Associations': [{'SubnetId': self.ids['Subnet'], 'Main': False}], 'Routes': [
                    {'DestinationCidrBlock': '10.249.240.0/24', 'GatewayId': 'local', 'State': 'active'},
                    {'DestinationCidrBlock': '0.0.0.0/0', 'GatewayId': self.ids['Internet'], 'State': 'active'}]}]},
            ('iam', 'get-instance-profile'): {'InstanceProfile': {'InstanceProfileName': self.ids['SessionProfile'],
                'Arn': self.profile_arn, 'Roles': [{'Arn': self.role_arn}]}},
            ('iam', 'get-role'): {'Role': {'Arn': self.role_arn, 'AssumeRolePolicyDocument': {'Version': '2012-10-17',
                'Statement': [{'Effect': 'Allow', 'Principal': {'Service': ['ec2.amazonaws.com']}, 'Action': ['sts:AssumeRole']}]}}},
            ('iam', 'list-role-policies'): {'PolicyNames': ['RecoverySessionAndOwnReadinessOnly'], 'IsTruncated': False},
            ('iam', 'list-attached-role-policies'): {'AttachedPolicies': [], 'IsTruncated': False},
            ('iam', 'get-role-policy'): {'PolicyDocument': {'Version': '2012-10-17', 'Statement': [
                {'Sid': '', 'Effect': 'Allow', 'Action': AUDIT.SESSION, 'Resource': '*'},
                {'Effect': 'Allow', 'Action': ['cloudformation:SignalResource'], 'Resource': [self.stack]},
                {'Effect': 'Deny', 'Action': AUDIT.DENY, 'Resource': '*'}]}}
        }

    def call(self, service, operation, *args):
        self.calls.append((service, operation, args))
        if (service, operation) not in AUDIT.READS:
            raise AssertionError('Mutation or non-metadata access')
        if service == 'cloudformation':
            assert args[args.index('--stack-name') + 1] == self.stack
        if operation in {'describe-instances', 'describe-instance-credit-specifications'}:
            assert args == ('--instance-ids', self.host)
        if service == 'iam':
            name = '--instance-profile-name' if operation == 'get-instance-profile' else '--role-name'
            expected = self.ids['SessionProfile'] if operation == 'get-instance-profile' else self.ids['SessionRole']
            assert args[args.index(name) + 1] == expected
        return copy.deepcopy(self.replies[service, operation])

    def instance(self):
        return self.replies['ec2', 'describe-instances']['Reservations'][0]['Instances'][0]


class InfrastructureTests(unittest.TestCase):
    def test_complete_live_metadata_binding_does_not_claim_real_restore(self):
        fake = Fake()
        result = AUDIT.inspect(fake.call, fake.stack, fake.ami)
        self.assertEqual(result['status'], 'RECOVERY_INFRASTRUCTURE_BINDING_PASSED')
        self.assertTrue(result['infrastructureBindingVerified'])
        for key in ['writesPerformed', 'privateKeyRead', 'productionDataRead', 'productionRestoreVerified', 'realRecoveryReady', 'resourceCleanupVerified']:
            self.assertFalse(result[key])

    def test_wrong_account_or_stack_stops_before_reading_host(self):
        fake = Fake()
        fake.replies['sts', 'get-caller-identity']['Account'] = '111111111111'
        with self.assertRaisesRegex(ValueError, 'REVIEWED_ACCOUNT'):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)
        self.assertEqual(len(fake.calls), 1)
        with self.assertRaisesRegex(ValueError, 'EXACT_SUBMITTED_STACK'):
            AUDIT.inspect(fake.call, fake.stack.replace('eu-north-1', 'us-east-1'), fake.ami)

    def test_incomplete_stack_or_template_drift_is_not_accepted(self):
        fake = Fake()
        fake.replies['cloudformation', 'describe-stacks']['Stacks'][0]['StackStatus'] = 'CREATE_IN_PROGRESS'
        with self.assertRaisesRegex(ValueError, 'COMPLETE_BOUND_STACK'):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)
        fake = Fake()
        fake.template['Resources']['RecoveryHost']['Properties']['InstanceType'] = 't3.medium'
        with self.assertRaisesRegex(ValueError, 'DEPLOYED_TEMPLATE'):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_resource_pagination_and_foreign_or_missing_resources_stop(self):
        for mutation in ['page', 'missing', 'wrong_type']:
            fake = Fake()
            page = fake.replies['cloudformation', 'list-stack-resources']
            if mutation == 'page':
                page['NextToken'] = 'more'
            elif mutation == 'missing':
                page['StackResourceSummaries'].pop()
            else:
                page['StackResourceSummaries'][0]['ResourceType'] = 'AWS::S3::Bucket'
            with self.assertRaises(ValueError):
                AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_live_host_tag_or_network_drift_stops(self):
        for field, value in [('ImageId', 'ami-00000000000000000'), ('InstanceType', 't3.medium'), ('VpcId', 'production-vpc')]:
            fake = Fake()
            fake.instance()[field] = value
            with self.assertRaises(ValueError):
                AUDIT.inspect(fake.call, fake.stack, fake.ami)
        fake = Fake()
        fake.instance()['Tags'][1]['Value'] = 'OtherScope'
        with self.assertRaises(ValueError):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_imds_weakening_or_production_host_is_rejected(self):
        fake = Fake()
        fake.instance()['MetadataOptions']['HttpTokens'] = 'optional'
        with self.assertRaisesRegex(ValueError, 'IMDS_BOUNDARY'):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)
        fake = Fake()
        for row in fake.replies['cloudformation', 'list-stack-resources']['StackResourceSummaries']:
            if row['LogicalResourceId'] == 'RecoveryHost':
                row['PhysicalResourceId'] = AUDIT.PREVIEW
        with self.assertRaisesRegex(ValueError, 'SYNTHETIC_HOST_ONLY'):
            AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_encrypted_delete_on_termination_and_standard_credits_are_required(self):
        for mutation in ['encryption', 'delete_disk', 'unlimited', 'stopped']:
            fake = Fake()
            if mutation == 'encryption':
                fake.replies['ec2', 'describe-volumes']['Volumes'][0]['Encrypted'] = False
            elif mutation == 'delete_disk':
                fake.instance()['BlockDeviceMappings'][0]['Ebs']['DeleteOnTermination'] = False
            elif mutation == 'unlimited':
                fake.replies['ec2', 'describe-instance-credit-specifications']['InstanceCreditSpecifications'][0]['CpuCredits'] = 'unlimited'
            else:
                fake.replies['ec2', 'describe-instance-attribute']['InstanceInitiatedShutdownBehavior']['Value'] = 'stop'
            with self.assertRaises(ValueError):
                AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_ingress_broad_egress_and_additional_routes_reject(self):
        for mutation in ['ingress', 'egress', 'route']:
            fake = Fake()
            group = fake.replies['ec2', 'describe-security-groups']['SecurityGroups'][0]
            if mutation == 'ingress':
                group['IpPermissions'] = [{'IpProtocol': '-1'}]
            elif mutation == 'egress':
                group['IpPermissionsEgress'][0]['FromPort'] = 0
            else:
                fake.replies['ec2', 'describe-route-tables']['RouteTables'][0]['Routes'].append({'VpcPeeringConnectionId': 'pcx-prod'})
            with self.assertRaises(ValueError):
                AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_extra_inline_managed_or_modified_role_permissions_reject(self):
        for mutation in ['inline', 'managed', 'policy', 'trust']:
            fake = Fake()
            if mutation == 'inline':
                fake.replies['iam', 'list-role-policies']['PolicyNames'].append('Extra')
            elif mutation == 'managed':
                fake.replies['iam', 'list-attached-role-policies']['AttachedPolicies'] = [{'PolicyArn': 'AdministratorAccess'}]
            elif mutation == 'policy':
                fake.replies['iam', 'get-role-policy']['PolicyDocument']['Statement'][0]['Action'] = '*'
            else:
                fake.replies['iam', 'get-role']['Role']['AssumeRolePolicyDocument']['Statement'][0]['Principal'] = '*'
            with self.assertRaises(ValueError):
                AUDIT.inspect(fake.call, fake.stack, fake.ami)

    def test_read_error_is_redacted_and_mutations_are_never_called(self):
        with patch.object(AUDIT.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'PRIVATE_ERROR_DATA')):
            with self.assertRaisesRegex(ValueError, '^READ_UNVERIFIED_IAM_GET_ROLE$'):
                AUDIT.aws('iam', 'get-role')
        for service, operation in [('s3', 'get-object'), ('ssm', 'get-parameter'), ('ec2', 'terminate-instances'), ('iam', 'put-role-policy')]:
            with self.assertRaisesRegex(ValueError, 'METADATA_READ_ONLY'):
                AUDIT.aws(service, operation)

    def test_receipt_requires_exact_owner_submission_and_rejects_symlinks(self):
        fake = Fake()
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            (root / 'attempt.json').write_text(json.dumps({'plan': {'instanceType': 't3.small', 'region': AUDIT.REGION,
                'amiId': fake.ami, 'templateSha256': AUDIT.TEMPLATE_SHA}}))
            (root / 'submitted.json').write_text(json.dumps({'phase': 'SUBMITTED', 'stackId': fake.stack}))
            self.assertEqual(AUDIT.binding(root), (fake.stack, fake.ami))
            (root / 'submitted.json').unlink()
            (root / 'submitted.json').symlink_to(root / 'attempt.json')
            with self.assertRaisesRegex(ValueError, 'OWNER_ATTEMPT_RECEIPT'):
                AUDIT.binding(root)

    def test_default_is_offline_and_no_feature_flag_or_key_intake_exists(self):
        with patch.object(AUDIT, 'binding', side_effect=AssertionError), patch.object(AUDIT, 'aws', side_effect=AssertionError), patch.object(sys, 'argv', ['audit']):
            self.assertEqual(AUDIT.main(), 0)


if __name__ == '__main__':
    unittest.main()
