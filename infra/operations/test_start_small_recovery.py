import copy
from contextlib import nullcontext
from decimal import Decimal
import hashlib
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
SPEC = importlib.util.spec_from_file_location('small_recovery', HERE / 'start-small-recovery.py')
SMALL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMALL)


class Fake:
    def __init__(self):
        self.calls = []
        self.account = SMALL.ACCOUNT
        self.plan = 'FREE'
        self.stack = None
        self.orphan = False
        self.pagination = False
        self.eligible_type = True
        self.eligible_image = True
        self.price = '0.0216'
        self.race = False
        self.observations = 0
        self.timeout_create = False
        self.root = None
        self.ami = 'ami-1234567890abcdef0'

    def call(self, service, operation, *args):
        self.calls.append((service, operation, args))
        if (service, operation) not in SMALL.CALLS:
            raise AssertionError('Unexpected AWS operation')
        if operation == 'get-caller-identity':
            return {'Account': self.account}
        if operation == 'get-account-plan-state':
            return {'accountId': SMALL.ACCOUNT, 'accountPlanType': self.plan, 'accountPlanStatus': 'ACTIVE'}
        if operation == 'describe-stacks':
            self.observations += 1
            status = self.stack or ('CREATE_IN_PROGRESS' if self.race and self.observations > 1 else None)
            return {'Stacks': [{'StackName': SMALL.STACK, 'StackId': self.stack_id(), 'StackStatus': status}]} if status else {'Stacks': [], '_confirmedAbsent': True}
        if operation == 'describe-instances':
            filters = json.loads(args[1])
            assert filters == [{'Name': 'tag:Project', 'Values': ['ORZELLRecoveryRehearsal']}]
            hosts = [{'InstanceId': 'i-1234567890abcdef0', 'State': {'Name': 'running'},
                      'Tags': [{'Key': 'Project', 'Value': 'ORZELLRecoveryRehearsal'}]}] if self.orphan else []
            return {'Reservations': [{'Instances': hosts}], **({'NextToken': 'more'} if self.pagination else {})}
        if operation == 'describe-instance-types':
            return {'InstanceTypes': [{'InstanceType': 't3.small', 'FreeTierEligible': self.eligible_type, 'MemoryInfo': {'SizeInMiB': 2048}}]}
        if operation == 'describe-images':
            if args[0] == '--image-ids':
                return {'Images': [{'ImageId': self.ami, 'FreeTierEligible': self.eligible_image}]}
            return {'Images': [{'ImageId': self.ami, 'State': 'available', 'Architecture': 'x86_64',
                'RootDeviceType': 'ebs', 'RootDeviceName': '/dev/xvda', 'Public': True,
                'Name': 'al2023-ami-2023.9.20261101.0-kernel-6.1-x86_64', 'ImageOwnerAlias': 'amazon',
                'CreationDate': '2026-11-01T00:00:00.000Z'}]}
        if operation == 'get-products':
            attrs = {f['Field']: f['Value'] for f in json.loads(args[args.index('--filters') + 1])}
            storage = attrs.get('volumeApiName') == 'gp3'
            if not storage:
                assert attrs['instanceType'] == 't3.small' and attrs['regionCode'] == SMALL.REGION
            product = {'product': {'attributes': {k: v for k, v in attrs.items() if k != 'productFamily'}},
                'terms': {'OnDemand': {'term': {'priceDimensions': {'rate': {'unit': 'GB-Mo' if storage else 'Hrs',
                'beginRange': '0', 'endRange': 'Inf', 'appliesTo': [], 'pricePerUnit': {'USD': '0.088' if storage else self.price}}}}}}}
            if storage:
                product['product']['productFamily'] = 'Storage'
            return {'PriceList': [json.dumps(product)]}
        if operation == 'validate-template':
            assert json.loads(Path(args[1].removeprefix('file://')).read_text())['Resources']['RecoveryHost']['Properties']['InstanceType'] == 't3.small'
            return {}
        if operation == 'create-stack':
            assert self.root is not None and (self.root / 'attempt.json').is_file()
            receipt = json.loads((self.root / 'attempt.json').read_text())
            assert receipt['phase'] == 'CREATE_MAY_BE_SUBMITTED'
            if self.timeout_create:
                raise subprocess.TimeoutExpired('aws', 35)
            return {'StackId': self.stack_id()}
        raise AssertionError('Unimplemented fake')

    def stack_id(self):
        return f'arn:aws:cloudformation:{SMALL.REGION}:{SMALL.ACCOUNT}:stack/{SMALL.STACK}/synthetic-uuid'


def module():
    return runpy.run_path(str(HERE / 'plan-recovery-host.py'))


class SmallRecoveryTests(unittest.TestCase):
    def test_immutable_planner_pin_and_actual_loader(self):
        body = (HERE / 'plan-recovery-host.py').read_bytes()
        self.assertEqual(hashlib.sha256(body).hexdigest(), SMALL.PLANNER_SHA)
        class Response:
            def geturl(self):
                return SMALL.PLANNER_URL
            def read(self, limit):
                return body[:limit]
        with patch.object(SMALL.urllib.request, 'urlopen', return_value=nullcontext(Response())):
            loaded = SMALL.planner()
            self.assertEqual(loaded['template']()['Resources']['RecoveryHost']['Properties']['InstanceType'], 't3.small')
        body += b'\n'
        with patch.object(SMALL.urllib.request, 'urlopen', return_value=nullcontext(Response())):
            with self.assertRaisesRegex(ValueError, 'PINNED_PLANNER_REQUIRED'):
                SMALL.planner()

    def test_offline_default_does_not_fetch_or_call_aws(self):
        with patch.object(SMALL, 'planner', side_effect=AssertionError), patch.object(SMALL, 'aws', side_effect=AssertionError), patch.object(sys, 'argv', ['small']):
            self.assertEqual(SMALL.main(), 0)

    def test_success_persists_attempt_before_exact_single_create(self):
        fake = Fake()
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / 'attempt'
            fake.root = root
            result = SMALL.create(fake.call, module(), root)
            self.assertEqual(result['status'], 'SYNTHETIC_STACK_SUBMITTED_NOT_READY')
            self.assertEqual(result['instanceType'], 't3.small')
            writes = [x for x in fake.calls if x[1] == 'create-stack']
            self.assertEqual(len(writes), 1)
            args = writes[0][2]
            for flag, value in [('--on-failure', 'DELETE'), ('--timeout-in-minutes', '20'), ('--client-request-token', SMALL.TOKEN), ('--stack-name', SMALL.STACK)]:
                self.assertEqual(args[args.index(flag) + 1], value)
            self.assertEqual(root.stat().st_mode & 0o777, 0o700)
            for name in ['template.json', 'attempt.json', 'submitted.json']:
                self.assertEqual((root / name).stat().st_mode & 0o777, 0o600)
            self.assertFalse(result['hardBillingCap'])

    def test_ambiguous_create_is_never_retried(self):
        fake = Fake()
        fake.timeout_create = True
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / 'attempt'
            fake.root = root
            with self.assertRaises(subprocess.TimeoutExpired):
                SMALL.create(fake.call, module(), root)
            with self.assertRaisesRegex(ValueError, 'LOCAL_ATTEMPT_EXISTS'):
                SMALL.create(fake.call, module(), root)
            self.assertEqual(len([x for x in fake.calls if x[1] == 'create-stack']), 1)

    def test_existing_stack_blocks_before_quote_or_mutation(self):
        for status in ['CREATE_IN_PROGRESS', 'CREATE_COMPLETE', 'DELETE_IN_PROGRESS', 'ROLLBACK_FAILED']:
            fake = Fake()
            fake.stack = status
            with self.assertRaisesRegex(ValueError, 'EXISTING_RECOVERY'):
                SMALL.prepare(fake.call, module())
            self.assertFalse(any(x[0] == 'pricing' for x in fake.calls))

    def test_orphan_with_only_project_tag_blocks_create(self):
        fake = Fake()
        fake.orphan = True
        with self.assertRaisesRegex(ValueError, 'EXISTING_RECOVERY'):
            SMALL.prepare(fake.call, module())

    def test_truncated_inventory_is_not_empty_inventory(self):
        fake = Fake()
        fake.pagination = True
        with self.assertRaisesRegex(ValueError, 'COMPLETE_HOST_INVENTORY'):
            SMALL.prepare(fake.call, module())

    def test_wrong_account_stops_first(self):
        fake = Fake()
        fake.account = '111111111111'
        with self.assertRaisesRegex(ValueError, 'REVIEWED_ACCOUNT'):
            SMALL.prepare(fake.call, module())
        self.assertEqual(len(fake.calls), 1)

    def test_paid_plan_does_not_upgrade_or_provision(self):
        fake = Fake()
        fake.plan = 'PAID'
        with self.assertRaisesRegex(ValueError, 'FREE_ACTIVE_ACCOUNT'):
            SMALL.prepare(fake.call, module())
        self.assertFalse(any(x[1] == 'create-stack' for x in fake.calls))

    def test_both_instance_and_ami_eligibility_are_required(self):
        for key, reason in [('eligible_type', 'SMALL_INSTANCE'), ('eligible_image', 'EXACT_AMI')]:
            fake = Fake()
            setattr(fake, key, False)
            with self.assertRaisesRegex(ValueError, reason):
                SMALL.prepare(fake.call, module())

    def test_unrounded_estimate_cannot_cross_previous_approval(self):
        fake = Fake()
        fake.price = str(SMALL.MAX_ESTIMATE / 2 - Decimal('0.088') * 20 / 720 - Decimal('0.005') + Decimal('0.00000001'))
        with self.assertRaisesRegex(ValueError, 'PREVIOUSLY_APPROVED_ESTIMATE_EXCEEDED'):
            SMALL.prepare(fake.call, module())

    def test_template_drift_rejects_before_quote(self):
        fake = Fake()
        plan = module()
        original = plan['template']
        def changed():
            result = copy.deepcopy(original())
            result['Resources']['Firewall']['Properties']['SecurityGroupIngress'] = [{'IpProtocol': '-1', 'CidrIp': '0.0.0.0/0'}]
            return result
        plan['template'] = changed
        with self.assertRaisesRegex(ValueError, 'CANONICAL_SMALL_TEMPLATE'):
            SMALL.prepare(fake.call, plan)

    def test_resource_appearing_during_preflight_stops_create(self):
        fake = Fake()
        fake.race = True
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / 'attempt'
            fake.root = root
            with self.assertRaisesRegex(ValueError, 'RECOVERY_APPEARED'):
                SMALL.create(fake.call, module(), root)
            self.assertFalse(any(x[1] == 'create-stack' for x in fake.calls))

    def test_cli_pins_region_and_single_attempt_and_redacts_errors(self):
        with patch.object(SMALL.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{}', '')) as runner:
            for service, operation in [('freetier', 'get-account-plan-state'), ('pricing', 'get-products'), ('ec2', 'describe-instances')]:
                SMALL.aws(service, operation)
                args, kwargs = runner.call_args
                self.assertEqual(args[0][args[0].index('--region') + 1], 'us-east-1' if service in {'pricing', 'freetier'} else 'eu-north-1')
                self.assertEqual(kwargs['env']['AWS_MAX_ATTEMPTS'], '1')
        with patch.object(SMALL.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', 'SENSITIVE_ERROR')):
            with self.assertRaisesRegex(ValueError, '^AWS_OPERATION_UNVERIFIED_'):
                SMALL.aws('cloudformation', 'create-stack')

    def test_only_exact_not_found_proves_stack_absence(self):
        error = f'An error occurred (ValidationError) when calling DescribeStacks: Stack with id {SMALL.STACK} does not exist'
        with patch.object(SMALL.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', error)):
            self.assertTrue(SMALL.aws('cloudformation', 'describe-stacks')['_confirmedAbsent'])
        with patch.object(SMALL.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, '', '(AccessDenied) not found')):
            with self.assertRaises(ValueError):
                SMALL.aws('cloudformation', 'describe-stacks')
        with self.assertRaisesRegex(ValueError, 'AUTHORITATIVE_STACK_ABSENCE'):
            SMALL.observe(lambda *args: {'Stacks': []})

    def test_mutation_allowlist_rejects_upgrade_update_delete_and_secret_access(self):
        for service, operation in [('freetier', 'upgrade-account-plan'), ('cloudformation', 'update-stack'), ('cloudformation', 'delete-stack'), ('s3', 'get-object'), ('ssm', 'get-parameter')]:
            with self.assertRaisesRegex(ValueError, 'OPERATION_NOT_ALLOWED'):
                SMALL.aws(service, operation)


if __name__ == '__main__':
    unittest.main()
