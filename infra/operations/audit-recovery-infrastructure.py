#!/usr/bin/env python3
"""Owner-only metadata audit of the submitted synthetic recovery stack; no writes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ACCOUNT = '926642724499'
REGION = 'eu-north-1'
STACK = 'orzell-recovery-rehearsal-v1'
PREVIEW = 'i-09fe7fdb5f10d63b6'
TEMPLATE_SHA = '7dda1cc25183b7d3283e9aaa7ca4c5fa136b8384b28f97be96136381f2ad6886'
STACK_RE = re.compile('arn:aws:cloudformation:' + REGION + ':' + ACCOUNT + ':stack/' + STACK + '/[A-Za-z0-9-]+')
TYPES = {'Network': 'AWS::EC2::VPC', 'Internet': 'AWS::EC2::InternetGateway',
         'AttachInternet': 'AWS::EC2::VPCGatewayAttachment', 'Subnet': 'AWS::EC2::Subnet',
         'Routes': 'AWS::EC2::RouteTable', 'PublicRoute': 'AWS::EC2::Route',
         'SubnetRoutes': 'AWS::EC2::SubnetRouteTableAssociation', 'Firewall': 'AWS::EC2::SecurityGroup',
         'SessionRole': 'AWS::IAM::Role', 'SessionProfile': 'AWS::IAM::InstanceProfile',
         'RecoveryHost': 'AWS::EC2::Instance'}
SESSION = ['ssm:UpdateInstanceInformation', 'ssmmessages:CreateControlChannel',
           'ssmmessages:CreateDataChannel', 'ssmmessages:OpenControlChannel', 'ssmmessages:OpenDataChannel']
DENY = ['s3:*', 'ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath',
        'secretsmanager:GetSecretValue', 'kms:Decrypt']
READS = {('sts', 'get-caller-identity'), ('cloudformation', 'describe-stacks'),
         ('cloudformation', 'get-template'), ('cloudformation', 'list-stack-resources'),
         ('ec2', 'describe-instances'), ('ec2', 'describe-instance-attribute'),
         ('ec2', 'describe-instance-credit-specifications'), ('ec2', 'describe-volumes'),
         ('ec2', 'describe-security-groups'), ('ec2', 'describe-route-tables'),
         ('iam', 'get-role'), ('iam', 'list-role-policies'), ('iam', 'get-role-policy'),
         ('iam', 'list-attached-role-policies'), ('iam', 'get-instance-profile')}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def aws(service, operation, *args):
    require((service, operation) in READS, 'METADATA_READ_ONLY_REQUIRED')
    p = subprocess.run(['aws', service, operation, *args, '--region', REGION,
                        '--no-cli-pager', '--no-paginate', '--output', 'json',
                        '--cli-connect-timeout', '5', '--cli-read-timeout', '20'],
                       capture_output=True, text=True, timeout=35)
    require(p.returncode == 0 and len(p.stdout) <= 250000,
            'READ_UNVERIFIED_' + service.upper() + '_' + operation.upper().replace('-', '_'))
    return json.loads(p.stdout)


def one(reply, key):
    require(not reply.get('NextToken') and not reply.get('IsTruncated') and not reply.get('Marker'),
            'COMPLETE_METADATA_REQUIRED')
    values = reply.get(key, [])
    require(isinstance(values, list) and len(values) == 1, 'ONE_BOUND_RESOURCE_REQUIRED')
    return values[0]


def policy(value):
    # Statement IDs and string/list representation do not alter IAM semantics.
    require(isinstance(value, dict), 'POLICY_OBJECT_REQUIRED')
    result = {k: v for k, v in value.items() if k != 'Statement'}
    statements = value.get('Statement', [])
    require(isinstance(statements, list), 'POLICY_STATEMENTS_REQUIRED')
    normalized = []
    for statement in statements:
        item = {k: v for k, v in statement.items() if k != 'Sid'}
        for key in ['Action', 'Resource']:
            if key in item:
                item[key] = sorted(item[key] if isinstance(item[key], list) else [item[key]])
        if isinstance(item.get('Principal'), dict):
            item['Principal'] = {k: sorted(v if isinstance(v, list) else [v]) for k, v in item['Principal'].items()}
        normalized.append(item)
    result['Statement'] = sorted(normalized, key=lambda s: json.dumps(s, sort_keys=True))
    return result


def binding(root):
    result = {}
    for name in ['attempt.json', 'submitted.json']:
        path = root / name
        require(not path.is_symlink() and path.is_file() and path.stat().st_size < 8192,
                'OWNER_ATTEMPT_RECEIPT_REQUIRED')
        result[name] = json.loads(path.read_text())
    submitted = result['submitted.json']
    plan = result['attempt.json'].get('plan', {})
    require(submitted.get('phase') == 'SUBMITTED' and bool(STACK_RE.fullmatch(submitted.get('stackId', ''))),
            'EXACT_SUBMITTED_STACK_REQUIRED')
    require(plan.get('instanceType') == 't3.small' and plan.get('region') == REGION
            and plan.get('templateSha256') == TEMPLATE_SHA
            and bool(re.fullmatch(r'ami-[0-9a-f]{8,17}', plan.get('amiId', ''))),
            'REVIEWED_SMALL_PLAN_RECEIPT_REQUIRED')
    return submitted['stackId'], plan['amiId']


def inspect(call, stack_id, ami_id):
    require(bool(STACK_RE.fullmatch(stack_id)), 'EXACT_SUBMITTED_STACK_REQUIRED')
    require(call('sts', 'get-caller-identity').get('Account') == ACCOUNT, 'REVIEWED_ACCOUNT_REQUIRED')
    stack = one(call('cloudformation', 'describe-stacks', '--stack-name', stack_id), 'Stacks')
    require(stack.get('StackId') == stack_id and stack.get('StackName') == STACK
            and stack.get('StackStatus') == 'CREATE_COMPLETE', 'COMPLETE_BOUND_STACK_REQUIRED')
    require({p['ParameterKey']: p.get('ParameterValue') for p in stack.get('Parameters', [])}.get('AmiId') == ami_id,
            'DEPLOYED_AMI_BINDING_REQUIRED')
    original = call('cloudformation', 'get-template', '--stack-name', stack_id, '--template-stage', 'Original').get('TemplateBody')
    if isinstance(original, str):
        original = json.loads(original)
    require(isinstance(original, dict) and hashlib.sha256(json.dumps(original, sort_keys=True).encode()).hexdigest() == TEMPLATE_SHA,
            'DEPLOYED_TEMPLATE_DIFFERS')
    page = call('cloudformation', 'list-stack-resources', '--stack-name', stack_id)
    require(not page.get('NextToken'), 'COMPLETE_STACK_RESOURCE_LIST_REQUIRED')
    resources = page.get('StackResourceSummaries', [])
    require(len(resources) == len(TYPES) and {r['LogicalResourceId']: r['ResourceType'] for r in resources} == TYPES
            and all(r.get('ResourceStatus') == 'CREATE_COMPLETE' and r.get('PhysicalResourceId') for r in resources),
            'EXACT_REVIEWED_RESOURCE_SET_REQUIRED')
    ids = {r['LogicalResourceId']: r['PhysicalResourceId'] for r in resources}
    identifier = ids['RecoveryHost']
    require(identifier != PREVIEW and bool(re.fullmatch(r'i-[0-9a-f]{17}', identifier)), 'SYNTHETIC_HOST_ONLY_REQUIRED')
    reservation = one(call('ec2', 'describe-instances', '--instance-ids', identifier), 'Reservations')
    instance = one(reservation, 'Instances')
    tags = {t['Key']: t['Value'] for t in instance.get('Tags', [])}
    require(instance.get('InstanceId') == identifier and instance.get('State', {}).get('Name') == 'running'
            and instance.get('InstanceType') == 't3.small' and instance.get('ImageId') == ami_id
            and tags.get('Project') == 'ORZELLRecoveryRehearsal' and tags.get('DataScope') == 'SyntheticOnly'
            and tags.get('aws:cloudformation:stack-id') == stack_id, 'LIVE_HOST_BINDING_DIFFERS')
    require(instance.get('VpcId') == ids['Network'] and instance.get('SubnetId') == ids['Subnet']
            and [g.get('GroupId') for g in instance.get('SecurityGroups', [])] == [ids['Firewall']],
            'LIVE_NETWORK_BINDING_DIFFERS')
    meta = instance.get('MetadataOptions', {})
    require(meta.get('State') == 'applied' and meta.get('HttpEndpoint') == 'enabled'
            and meta.get('HttpTokens') == 'required' and meta.get('HttpPutResponseHopLimit') == 1,
            'IMDS_BOUNDARY_DIFFERS')
    interface = one({'Interfaces': instance.get('NetworkInterfaces', [])}, 'Interfaces')
    require(interface.get('Attachment', {}).get('DeleteOnTermination') is True
            and interface.get('Attachment', {}).get('DeviceIndex') == 0, 'INTERFACE_CLEANUP_SETTING_DIFFERS')
    shutdown = call('ec2', 'describe-instance-attribute', '--instance-id', identifier, '--attribute', 'instanceInitiatedShutdownBehavior')
    require(shutdown.get('InstanceId') == identifier
            and shutdown.get('InstanceInitiatedShutdownBehavior', {}).get('Value') == 'terminate', 'TERMINATE_ON_SHUTDOWN_REQUIRED')
    credit = one(call('ec2', 'describe-instance-credit-specifications', '--instance-ids', identifier), 'InstanceCreditSpecifications')
    require(credit.get('InstanceId') == identifier and credit.get('CpuCredits') == 'standard', 'STANDARD_CREDITS_REQUIRED')
    disk = one({'Disks': instance.get('BlockDeviceMappings', [])}, 'Disks')
    require(disk.get('DeviceName') == '/dev/xvda' and disk.get('Ebs', {}).get('DeleteOnTermination') is True,
            'ROOT_DISK_CLEANUP_SETTING_DIFFERS')
    volume = one(call('ec2', 'describe-volumes', '--volume-ids', disk['Ebs']['VolumeId']), 'Volumes')
    attachment = one({'Attachments': volume.get('Attachments', [])}, 'Attachments')
    require(volume.get('VolumeId') == disk['Ebs']['VolumeId'] and volume.get('Encrypted') is True
            and volume.get('Size') == 20 and volume.get('VolumeType') == 'gp3'
            and volume.get('Iops') == 3000 and volume.get('Throughput') == 125
            and not volume.get('MultiAttachEnabled', False)
            and attachment.get('InstanceId') == identifier and attachment.get('Device') == '/dev/xvda'
            and attachment.get('State') == 'attached', 'ENCRYPTED_DISPOSABLE_DISK_REQUIRED')
    firewall = one(call('ec2', 'describe-security-groups', '--group-ids', ids['Firewall']), 'SecurityGroups')
    require(firewall.get('GroupId') == ids['Firewall'] and firewall.get('VpcId') == ids['Network']
            and firewall.get('IpPermissions') == [], 'NO_INGRESS_REQUIRED')
    rule = one({'Rules': firewall.get('IpPermissionsEgress', [])}, 'Rules')
    require(rule.get('IpProtocol') == 'tcp' and rule.get('FromPort') == 443 and rule.get('ToPort') == 443
            and [r.get('CidrIp') for r in rule.get('IpRanges', [])] == ['0.0.0.0/0']
            and not rule.get('Ipv6Ranges') and not rule.get('PrefixListIds') and not rule.get('UserIdGroupPairs'),
            'HTTPS_ONLY_EGRESS_REQUIRED')
    route = one(call('ec2', 'describe-route-tables', '--route-table-ids', ids['Routes']), 'RouteTables')
    require(route.get('RouteTableId') == ids['Routes'] and route.get('VpcId') == ids['Network']
            and any(a.get('SubnetId') == ids['Subnet'] and not a.get('Main') for a in route.get('Associations', [])),
            'ROUTE_TABLE_BINDING_DIFFERS')
    routes = route.get('Routes', [])
    require(len(routes) == 2 and {(r.get('DestinationCidrBlock'), r.get('GatewayId')) for r in routes}
            == {('10.249.240.0/24', 'local'), ('0.0.0.0/0', ids['Internet'])}
            and all(r.get('State') == 'active' for r in routes), 'NO_EXTRA_REACHABLE_ROUTE_REQUIRED')
    profile = call('iam', 'get-instance-profile', '--instance-profile-name', ids['SessionProfile']).get('InstanceProfile', {})
    roles = profile.get('Roles', [])
    role_arn = 'arn:aws:iam::' + ACCOUNT + ':role/' + ids['SessionRole']
    require(profile.get('InstanceProfileName') == ids['SessionProfile'] and len(roles) == 1
            and roles[0].get('Arn') == role_arn and instance.get('IamInstanceProfile', {}).get('Arn') == profile.get('Arn'),
            'INSTANCE_PROFILE_BINDING_DIFFERS')
    role = call('iam', 'get-role', '--role-name', ids['SessionRole']).get('Role', {})
    require(role.get('Arn') == role_arn and policy(role.get('AssumeRolePolicyDocument')) == policy({
        'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Principal': {'Service': 'ec2.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}),
        'EC2_ONLY_TRUST_REQUIRED')
    inline = call('iam', 'list-role-policies', '--role-name', ids['SessionRole'])
    attached = call('iam', 'list-attached-role-policies', '--role-name', ids['SessionRole'])
    require(not inline.get('IsTruncated') and not inline.get('Marker')
            and inline.get('PolicyNames') == ['RecoverySessionAndOwnReadinessOnly']
            and not attached.get('IsTruncated') and not attached.get('Marker')
            and attached.get('AttachedPolicies') == [], 'NO_ADDITIONAL_ROLE_PERMISSIONS_REQUIRED')
    document = call('iam', 'get-role-policy', '--role-name', ids['SessionRole'],
                    '--policy-name', 'RecoverySessionAndOwnReadinessOnly').get('PolicyDocument')
    expected = {'Version': '2012-10-17', 'Statement': [
        {'Effect': 'Allow', 'Action': SESSION, 'Resource': '*'},
        {'Effect': 'Allow', 'Action': 'cloudformation:SignalResource', 'Resource': stack_id},
        {'Effect': 'Deny', 'Action': DENY, 'Resource': '*'}]}
    require(policy(document) == policy(expected), 'EXACT_MINIMUM_ROLE_POLICY_REQUIRED')
    return {'status': 'RECOVERY_INFRASTRUCTURE_BINDING_PASSED', 'checkedAt': datetime.now(timezone.utc).isoformat(),
            'instanceId': identifier, 'stackId': stack_id, 'infrastructureBindingVerified': True,
            'productionDataRead': False, 'privateKeyRead': False, 'writesPerformed': False,
            'realRecoveryReady': False, 'productionRestoreVerified': False, 'resourceCleanupVerified': False,
            'remainingBlockers': ['CURRENT_RUNTIME_AND_LOGGING_REVIEW', 'PROTECTED_KEY_AND_PACKAGE_HANDOFF',
                                  'BOUNDED_OFFLINE_RESTORE_AND_SCHEMA_QUARANTINE']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args()
    try:
        if args.inspect:
            stack_id, ami_id = binding(Path.home() / 'orzell-kurtarma-v4')
            print(json.dumps(inspect(aws, stack_id, ami_id), sort_keys=True))
        else:
            print(json.dumps({'status': 'OFFLINE_AUDIT_NO_NETWORK', 'writesPerformed': False,
                              'privateKeyRead': False, 'productionDataRead': False, 'realRecoveryReady': False}))
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error, ValueError) and re.fullmatch('[A-Z0-9_]{1,140}', str(error)) else type(error).__name__
        print(json.dumps({'status': 'RECOVERY_INFRASTRUCTURE_NOT_VERIFIED', 'reason': reason,
                          'writesPerformed': False, 'privateKeyRead': False, 'productionDataRead': False,
                          'realRecoveryReady': False, 'productionRestoreVerified': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
