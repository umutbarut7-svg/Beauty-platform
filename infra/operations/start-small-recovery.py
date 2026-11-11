#!/usr/bin/env python3
"""Owner-operated t3.small synthetic rehearsal; no production data or key intake."""
import argparse
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import tempfile
import urllib.request

ACCOUNT = '926642724499'
REGION = 'eu-north-1'
STACK = 'orzell-recovery-rehearsal-v1'
PREVIEW = 'i-09fe7fdb5f10d63b6'
PLANNER_URL = 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/9d330548afa77f42eb062a95652315f32086174a/infra/operations/plan-recovery-host.py'
PLANNER_SHA = '7dd983a7905f04f49a24d44331368dd0f97fd2698785c93fb50a8cb9684e1206'
TEMPLATE_SHA = '7dda1cc25183b7d3283e9aaa7ca4c5fa136b8384b28f97be96136381f2ad6886'
MAX_ESTIMATE = Decimal('0.101044')
TOKEN = 'orzell-synthetic-small-20261111-v4'
STACK_RE = re.compile('arn:aws:cloudformation:' + REGION + ':' + ACCOUNT + ':stack/' + STACK + '/[A-Za-z0-9-]+')
CALLS = {('sts', 'get-caller-identity'), ('freetier', 'get-account-plan-state'),
         ('ec2', 'describe-instances'), ('ec2', 'describe-instance-types'),
         ('ec2', 'describe-images'), ('pricing', 'get-products'),
         ('cloudformation', 'describe-stacks'), ('cloudformation', 'validate-template'),
         ('cloudformation', 'create-stack')}


def aws(service, operation, *args):
    if (service, operation) not in CALLS:
        raise ValueError('OPERATION_NOT_ALLOWED')
    region = 'us-east-1' if service in {'pricing', 'freetier'} else REGION
    # A mutation is never automatically retried after an ambiguous transport error.
    env = dict(os.environ, AWS_MAX_ATTEMPTS='1', AWS_RETRY_MODE='standard')
    p = subprocess.run(['aws', service, operation, *args, '--region', region,
                        '--output', 'json', '--no-cli-pager', '--no-paginate',
                        '--cli-connect-timeout', '5', '--cli-read-timeout', '20'],
                       env=env, capture_output=True, text=True, timeout=35)
    if p.returncode:
        absent = (service, operation) == ('cloudformation', 'describe-stacks')
        if absent and '(ValidationError)' in p.stderr and ('Stack with id ' + STACK + ' does not exist') in p.stderr:
            return {'Stacks': [], '_confirmedAbsent': True}
        raise ValueError('AWS_OPERATION_UNVERIFIED_' + service.upper() + '_' + operation.upper().replace('-', '_'))
    if len(p.stdout) > 200000:
        raise ValueError('BOUNDED_RESPONSE_REQUIRED')
    return json.loads(p.stdout)


def planner():
    with urllib.request.urlopen(PLANNER_URL, timeout=20) as response:
        if response.geturl() != PLANNER_URL:
            raise ValueError('PINNED_SOURCE_URL_REQUIRED')
        body = response.read(32769)
    if len(body) > 32768 or hashlib.sha256(body).hexdigest() != PLANNER_SHA:
        raise ValueError('PINNED_PLANNER_REQUIRED')
    with tempfile.TemporaryDirectory(prefix='orzell-public-planner-') as root:
        path = Path(root) / 'planner.py'
        path.write_bytes(body)
        module = runpy.run_path(str(path))
    module['template'].__globals__['INSTANCE'] = 't3.small'
    return module


def check_identity(call):
    if call('sts', 'get-caller-identity').get('Account') != ACCOUNT:
        raise ValueError('REVIEWED_ACCOUNT_REQUIRED')


def observe(call):
    stack = call('cloudformation', 'describe-stacks', '--stack-name', STACK)
    values = stack.get('Stacks', [])
    if values:
        if len(values) != 1 or values[0].get('StackName') != STACK or not STACK_RE.fullmatch(values[0].get('StackId', '')):
            raise ValueError('EXACT_STACK_BINDING_REQUIRED')
    elif stack.get('_confirmedAbsent') is not True:
        raise ValueError('AUTHORITATIVE_STACK_ABSENCE_REQUIRED')
    # Project alone is intentionally broader than the old three-tag inventory:
    # an orphan missing its CloudFormation/DataScope tag must block another create.
    page = call('ec2', 'describe-instances', '--filters',
                json.dumps([{'Name': 'tag:Project', 'Values': ['ORZELLRecoveryRehearsal']}]),
                '--max-results', '100')
    if page.get('NextToken'):
        raise ValueError('COMPLETE_HOST_INVENTORY_REQUIRED')
    hosts = []
    for reservation in page.get('Reservations', []):
        for host in reservation.get('Instances', []):
            identifier = host.get('InstanceId', '')
            state = host.get('State', {}).get('Name')
            tags = {t['Key']: t['Value'] for t in host.get('Tags', [])}
            if (identifier == PREVIEW or not re.fullmatch(r'i-[0-9a-f]{8,17}', identifier)
                    or tags.get('Project') != 'ORZELLRecoveryRehearsal'
                    or state not in {'pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'}):
                raise ValueError('RECOVERY_HOST_IDENTITY_UNVERIFIED')
            hosts.append({'instanceId': identifier, 'state': state})
    return {'stackId': values[0]['StackId'] if values else None,
            'stackStatus': values[0].get('StackStatus') if values else None,
            'hosts': hosts, 'activeHosts': sum(h['state'] != 'terminated' for h in hosts)}


def prepare(call, module):
    check_identity(call)
    current = observe(call)
    if current['stackId'] or current['activeHosts']:
        raise ValueError('EXISTING_RECOVERY_REQUIRES_STATUS_REVIEW')
    account = call('freetier', 'get-account-plan-state')
    if (account.get('accountId') != ACCOUNT or account.get('accountPlanType') != 'FREE'
            or account.get('accountPlanStatus') != 'ACTIVE'):
        raise ValueError('FREE_ACTIVE_ACCOUNT_REQUIRED_NO_UPGRADE')
    types = call('ec2', 'describe-instance-types', '--instance-types', 't3.small')
    candidates = types.get('InstanceTypes', [])
    if (types.get('NextToken') or len(candidates) != 1
            or candidates[0].get('InstanceType') != 't3.small'
            or candidates[0].get('FreeTierEligible') is not True
            or candidates[0].get('MemoryInfo', {}).get('SizeInMiB', 0) < 2048):
        raise ValueError('SMALL_INSTANCE_ELIGIBILITY_REQUIRED')
    module['template'].__globals__['INSTANCE'] = 't3.small'
    body = json.dumps(module['template'](), sort_keys=True)
    if hashlib.sha256(body.encode()).hexdigest() != TEMPLATE_SHA:
        raise ValueError('CANONICAL_SMALL_TEMPLATE_REQUIRED')
    quote = module['inspect'](call)
    if quote.get('region') != REGION or quote.get('instanceType') != 't3.small':
        raise ValueError('SMALL_REGIONAL_QUOTE_REQUIRED')
    cost = (Decimal(quote['computeUsdPerHour']) + Decimal(quote['gp3UsdPerGbMonth']) * 20 / 720 + Decimal('0.005')) * 2
    if not cost.is_finite() or cost <= 0 or cost > MAX_ESTIMATE:
        raise ValueError('PREVIOUSLY_APPROVED_ESTIMATE_EXCEEDED')
    images = call('ec2', 'describe-images', '--image-ids', quote['amiId'])
    found = images.get('Images', [])
    if (images.get('NextToken') or len(found) != 1 or found[0].get('ImageId') != quote['amiId']
            or found[0].get('FreeTierEligible') is not True):
        raise ValueError('EXACT_AMI_ELIGIBILITY_REQUIRED')
    return body, {'instanceType': 't3.small', 'region': REGION, 'amiId': quote['amiId'],
                  'estimatedTwoHourUsd': str(cost), 'amiFreeTierEligible': True,
                  'templateSha256': TEMPLATE_SHA, 'hardBillingCap': False,
                  'excludesTaxAndDataTransfer': True}


def create(call, module, root):
    if root.exists():
        raise ValueError('LOCAL_ATTEMPT_EXISTS_USE_STATUS_NO_RETRY')
    body, plan = prepare(call, module)
    root.mkdir(mode=0o700, parents=False, exist_ok=False)
    # Exclusive attempt receipt is persisted BEFORE create; never overwrite it.
    template = root / 'template.json'
    template.write_text(body)
    template.chmod(0o600)
    call('cloudformation', 'validate-template', '--template-body', 'file://' + str(template))
    # Recheck resource absence immediately before mutating; races fail at create.
    check_identity(call)
    current = observe(call)
    if current['stackId'] or current['activeHosts']:
        raise ValueError('RECOVERY_APPEARED_DURING_PREFLIGHT')
    receipt = root / 'attempt.json'
    with receipt.open('x') as target:
        json.dump({'token': TOKEN, 'plan': plan, 'phase': 'CREATE_MAY_BE_SUBMITTED'}, target)
        target.flush()
        os.fsync(target.fileno())
    receipt.chmod(0o600)
    result = call('cloudformation', 'create-stack', '--stack-name', STACK,
                  '--template-body', 'file://' + str(template), '--parameters',
                  'ParameterKey=AmiId,ParameterValue=' + plan['amiId'],
                  '--capabilities', 'CAPABILITY_IAM', '--on-failure', 'DELETE',
                  '--timeout-in-minutes', '20', '--client-request-token', TOKEN)
    if not STACK_RE.fullmatch(result.get('StackId', '')):
        raise ValueError('CREATE_RESULT_UNVERIFIED_USE_STATUS_NO_RETRY')
    with (root / 'submitted.json').open('x') as target:
        json.dump({'stackId': result['StackId'], 'phase': 'SUBMITTED'}, target)
    (root / 'submitted.json').chmod(0o600)
    return dict(plan, status='SYNTHETIC_STACK_SUBMITTED_NOT_READY', stackId=result['StackId'])


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--preflight', action='store_true')
    mode.add_argument('--create-reviewed-synthetic-host', action='store_true')
    mode.add_argument('--status', action='store_true')
    args = parser.parse_args()
    try:
        if args.status:
            check_identity(aws)
            result = dict(observe(aws), status='RECOVERY_METADATA_OBSERVED')
        elif args.preflight:
            _, result = prepare(aws, planner())
            result['status'] = 'PREFLIGHT_PASSED_NO_RESOURCES_CREATED'
        elif args.create_reviewed_synthetic_host:
            result = create(aws, planner(), Path.home() / 'orzell-kurtarma-v4')
        else:
            result = {'status': 'OFFLINE_PLAN_NO_ACTION', 'instanceType': 't3.small',
                      'previousApprovedEstimateUsd': str(MAX_ESTIMATE), 'templateSha256': TEMPLATE_SHA}
        result.update(realRecoveryReady=False, productionRestoreVerified=False,
                      privateKeyRead=False, productionDataRead=False, resourceCleanupVerified=False)
        print(json.dumps(result, sort_keys=True), flush=True)
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]{1,140}', str(error)) else type(error).__name__
        print(json.dumps({'status': 'STOPPED_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY', 'reason': reason,
                          'productionRestoreVerified': False, 'privateKeyRead': False,
                          'productionDataRead': False}), flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
