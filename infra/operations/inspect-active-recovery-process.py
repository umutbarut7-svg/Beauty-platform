#!/usr/bin/env python3
"""Explicit metadata-only check of the one existing recovery host; no key intake."""
import json
import re
import sys
import time

HOST = 'i-02fb787d173779b04'
STACK = 'arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/3635fd80-dfa2-11f1-af8a-06ffea20fa49'
REMOTE = r'''
import json, os, termios
from pathlib import Path
rows=[]
for proc in Path('/proc').glob('[0-9]*'):
    try:
        args=(proc/'cmdline').read_bytes().split(b'\0')
        if b'/opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py' not in args or b'--start-isolated-session' not in args:
            continue
        row={'pid':int(proc.name),'waitingAt':(proc/'wchan').read_text().strip()}
        fd=os.open(str(proc/'fd/0'),os.O_RDONLY|os.O_NONBLOCK|os.O_NOCTTY)
        try:
            row['stdinIsTTY']=os.isatty(fd)
            if row['stdinIsTTY']:
                a=termios.tcgetattr(fd)
                row.update(canonicalInput=bool(a[3]&termios.ICANON),echo=bool(a[3]&termios.ECHO),carriageReturnToNewline=bool(a[0]&termios.ICRNL))
        finally:
            os.close(fd)
        rows.append(row)
    except (OSError,ValueError):
        pass
print(json.dumps({'processes':rows,'stdinContentRead':False,'privateKeyRead':False}))
'''


def inspect():
    import boto3
    from botocore.config import Config
    aws=boto3.Session(region_name='eu-north-1')
    config=Config(connect_timeout=3,read_timeout=5,retries={'total_max_attempts':1})
    if aws.client('sts',config=config).get_caller_identity()['Account']!='926642724499':
        raise ValueError('OWNER_ACCOUNT_MISMATCH')
    stack=aws.client('cloudformation',config=config).describe_stacks(StackName=STACK)['Stacks'][0]
    outputs={v['OutputKey']:v['OutputValue'] for v in stack.get('Outputs',[])}
    if stack['StackId']!=STACK or stack['StackStatus']!='CREATE_COMPLETE' or outputs.get('InstanceId')!=HOST:
        raise ValueError('EXACT_EXISTING_RECOVERY_HOST_REQUIRED')
    ssm=aws.client('ssm',config=config)
    command=ssm.send_command(InstanceIds=[HOST],DocumentName='AWS-RunShellScript',
        Parameters={'commands':["python3 - <<'ORZELL_METADATA'\n"+REMOTE+"\nORZELL_METADATA"],
                    'executionTimeout':['15']},TimeoutSeconds=30,
        Comment='ORZELL recovery process metadata only; no stdin content read')['Command']['CommandId']
    deadline=time.monotonic()+25
    while time.monotonic()<deadline:
        try:
            reply=ssm.get_command_invocation(CommandId=command,InstanceId=HOST)
        except ssm.exceptions.InvocationDoesNotExist:
            time.sleep(1)
            continue
        if reply['Status'] in ('Pending','InProgress','Delayed'):
            time.sleep(1)
            continue
        if reply['Status']!='Success':
            return {'status':'METADATA_COMMAND_NOT_VERIFIED','commandId':command}
        raw=reply.get('StandardOutputContent','')
        if len(raw)>8192:
            raise ValueError('METADATA_OUTPUT_LIMIT')
        value=json.loads(raw)
        if (type(value) is not dict or value.get('stdinContentRead') is not False
                or value.get('privateKeyRead') is not False or type(value.get('processes')) is not list
                or len(value['processes'])>8):
            raise ValueError('METADATA_RESULT_INVALID')
        rows=[]
        for row in value['processes']:
            if (type(row) is not dict or type(row.get('pid')) is not int or row['pid']<=0
                    or type(row.get('waitingAt')) is not str
                    or not re.fullmatch('[A-Za-z0-9_]{1,80}',row['waitingAt'])
                    or type(row.get('stdinIsTTY')) is not bool):
                raise ValueError('METADATA_RESULT_INVALID')
            safe={k:row[k] for k in ('pid','waitingAt','stdinIsTTY')}
            for key in ('canonicalInput','echo','carriageReturnToNewline'):
                if key in row:
                    if type(row[key]) is not bool:
                        raise ValueError('METADATA_RESULT_INVALID')
                    safe[key]=row[key]
            rows.append(safe)
        return {'status':'RECOVERY_PROCESS_METADATA','processes':rows,
                'stdinContentRead':False,'privateKeyRead':False}
    return {'status':'METADATA_COMMAND_PENDING','commandId':command}


if __name__=='__main__':
    if sys.argv[1:]!=['--inspect-current-recovery']:
        print(json.dumps({'status':'OFFLINE_NO_ACTION','privateKeyRead':False}))
        raise SystemExit(0 if len(sys.argv)==1 else 2)
    try:
        print(json.dumps(inspect()))
    except Exception as exc:
        reason=str(exc) if isinstance(exc,ValueError) and re.fullmatch('[A-Z_]{1,100}',str(exc)) else 'METADATA_INSPECTION_FAILED'
        print(json.dumps({'status':'METADATA_NOT_VERIFIED','reason':reason,'privateKeyRead':False}))
        raise SystemExit(1)
