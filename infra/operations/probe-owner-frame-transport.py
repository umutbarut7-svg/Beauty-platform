#!/usr/bin/env python3
"""Bounded generated-only SSM pipe diagnostic for the existing fourth host."""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
import pty
import re
import selectors
import shlex
import signal
import subprocess
import sys
import time

HOST = 'i-02fb787d173779b04'
STACK = 'arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/3635fd80-dfa2-11f1-af8a-06ffea20fa49'
EXPECTED = '36c921f3eb0f31bfaadb479e63c20f4904d9034fa59234da58cea7ede0644c3a'
REMOTE_PATH = '/opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py'


def probe_source(path=REMOTE_PATH, digest=EXPECTED):
    return ('import hashlib,json,pathlib,runpy,time\n'
            'p=pathlib.Path('+repr(path)+')\n'
            'if hashlib.sha256(p.read_bytes()).hexdigest()!='+repr(digest)+': raise ValueError("PINNED_RUNNER_REQUIRED")\n'
            'r=runpy.run_path(str(p))\n'
            'print("ORZELL_PROBE_READY",flush=True)\n'
            'v=r["read_frame"](time.monotonic()+8)\n'
            'print("ORZELL_PROBE_RESULT "+json.dumps({"bytes":len(v),"sha256":hashlib.sha256(v).hexdigest()}),flush=True)\n')


def summarize(rows):
    return [{'ID': s['SessionId'], 'Durum': s['Status']} for s in rows]


def active_sessions(ssm):
    rows = []
    for page in ssm.get_paginator('describe_sessions').paginate(
            State='Active', Filters=[{'key': 'Target', 'value': HOST}]):
        rows.extend(page.get('Sessions', []))
    return rows


def run(command, *, timeout_seconds=35, cleanup=None):
    payload = b'ORZELL_GENERATED_NON_SECRET_PROBE_'*400
    encoded = base64.b64encode(payload)
    frame = b'ORZELL-CAPSULE-V1\n'+b'\n'.join(encoded[i:i+256] for i in range(0,len(encoded),256))+b'\nEND-ORZELL-CAPSULE\n'
    expected = {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
    master, slave = pty.openpty()
    process = None
    pending = bytearray()
    outgoing = bytearray()
    session_id = None
    ready = observed = False
    sent_bytes = output_bytes = lf_bytes = cr_bytes = 0
    exit_code = None
    reason = 'DEADLINE'
    cleanup_status = 'NO_SESSION_ID_OBSERVED'
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=slave,
                                   stderr=slave, start_new_session=True)
        os.close(slave)
        slave = None
        os.set_blocking(process.stdin.fileno(), False)
        deadline = time.monotonic()+timeout_seconds
        with selectors.DefaultSelector() as selector:
            selector.register(master, selectors.EVENT_READ, 'output')
            while time.monotonic() < deadline:
                events = selector.select(max(0,deadline-time.monotonic()))
                if not events:
                    break
                ended = False
                for key, _ in events:
                    if key.data == 'send':
                        try:
                            count = os.write(process.stdin.fileno(), outgoing[:1024])
                        except BlockingIOError:
                            continue
                        if count <= 0:
                            raise ValueError('PIPE_CLOSED')
                        del outgoing[:count]
                        sent_bytes += count
                        if not outgoing:
                            selector.unregister(process.stdin)
                        continue
                    try:
                        chunk = os.read(master,4096)
                    except OSError:
                        chunk = b''
                    if not chunk:
                        ended = True
                        reason = 'CHILD_ENDED'
                        break
                    output_bytes += len(chunk)
                    lf_bytes += chunk.count(b'\n')
                    cr_bytes += chunk.count(b'\r')
                    pending.extend(chunk)
                    if output_bytes > 65536 or len(pending) > 8192:
                        raise ValueError('PUBLIC_PROBE_OUTPUT_LIMIT')
                    # Report CR/LF counts; recognize both transport line endings.
                    while b'\n' in pending or b'\r' in pending:
                        ends = [n for n in (pending.find(b'\n'), pending.find(b'\r')) if n >= 0]
                        cut = min(ends)
                        line = bytes(pending[:cut])
                        del pending[:cut+1]
                        found = re.fullmatch(rb'Starting session with SessionId: ([A-Za-z0-9-]{1,96})', line)
                        if found:
                            if session_id is not None:
                                raise ValueError('ONE_PROBE_SESSION_REQUIRED')
                            session_id = found[1].decode('ascii')
                        if line == b'ORZELL_PROBE_READY' and not ready:
                            ready = True
                            outgoing.extend(frame)
                            selector.register(process.stdin, selectors.EVENT_WRITE, 'send')
                        elif line.startswith(b'ORZELL_PROBE_RESULT '):
                            observed = json.loads(line[len(b'ORZELL_PROBE_RESULT '):]) == expected
                if ended:
                    break
        if process.poll() is not None:
            exit_code = process.returncode
        elif reason == 'CHILD_ENDED':
            exit_code = process.wait(timeout=3)
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch('[A-Z_]{1,100}', str(exc)) else 'PROBE_FAILED'
    finally:
        if process is not None:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=3)
                except ProcessLookupError:
                    pass
            exit_code = process.returncode
            process.stdin.close()
        os.close(master)
        if slave is not None:
            os.close(slave)
        pending.clear()
        outgoing.clear()
        if cleanup is not None and session_id is not None:
            cleanup_status = cleanup(session_id)
    passed = observed and sent_bytes == len(frame) and exit_code == 0
    result = {'status': 'GENERATED_FRAME_TRANSPORT_PASSED' if passed else 'GENERATED_FRAME_TRANSPORT_NOT_VERIFIED',
              'readyObserved': ready, 'sentBytes': sent_bytes, 'frameBytes': len(frame),
              'exactPayloadMatched': observed, 'outputBytes': output_bytes,
              'outputLF': lf_bytes, 'outputCR': cr_bytes, 'sessionExitCode': exit_code,
              'reason': reason, 'probeSessionCleanup': cleanup_status,
              'privateKeyRead': False, 'productionDataRead': False, 'restoreStarted': False}
    print(json.dumps(result), flush=True)
    return result


def start():
    import boto3
    from botocore.config import Config
    aws = boto3.Session(region_name='eu-north-1')
    config = Config(connect_timeout=10, read_timeout=15, retries={'total_max_attempts': 1})
    if aws.client('sts', config=config).get_caller_identity()['Account'] != '926642724499':
        raise ValueError('OWNER_ACCOUNT_MISMATCH')
    stack = aws.client('cloudformation', config=config).describe_stacks(StackName=STACK)['Stacks'][0]
    outputs = {v['OutputKey']: v['OutputValue'] for v in stack.get('Outputs', [])}
    if (stack['StackId'] != STACK or stack['StackStatus'] != 'CREATE_COMPLETE'
            or outputs.get('InstanceId') != HOST
            or outputs.get('Purpose') != 'PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED'):
        raise ValueError('EXACT_EXISTING_FOURTH_HOST_REQUIRED')
    ssm = aws.client('ssm', config=config)
    if active_sessions(ssm):
        raise ValueError('ACTIVE_SESSION_EXISTS_NO_PROBE_STARTED')
    started = datetime.now(timezone.utc)
    def cleanup(session_id):
        try:
            matches = [s for s in active_sessions(ssm) if s.get('SessionId') == session_id]
            if not matches:
                return 'NO_ACTIVE_PROBE_SESSION'
            s = matches[0]
            if len(matches) != 1 or s.get('Target') != HOST or s['StartDate'] < started:
                return 'PROBE_SESSION_BINDING_REJECTED'
            ssm.terminate_session(SessionId=session_id)
            return 'EXACT_PROBE_SESSION_TERMINATED'
        except Exception:
            return 'PROBE_SESSION_CLEANUP_NOT_VERIFIED'
    parameters = {'command': ['sudo timeout 15 python3 -u -c '+shlex.quote(probe_source())]}
    command = ['aws','ssm','start-session','--region','eu-north-1','--target',HOST,
               '--document-name','AWS-StartInteractiveCommand','--parameters',json.dumps(parameters), '--no-cli-pager']
    return run(command, cleanup=cleanup)


if __name__ == '__main__':
    if sys.argv[1:] != ['--probe-generated-frame']:
        print(json.dumps({'status': 'OFFLINE_NO_ACTION', 'privateKeyRead': False, 'restoreStarted': False}))
        raise SystemExit(0 if len(sys.argv) == 1 else 2)
    try:
        start()
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch('[A-Z_]{1,100}', str(exc)) else 'PROBE_NOT_STARTED'
        print(json.dumps({'status': 'GENERATED_FRAME_TRANSPORT_NOT_VERIFIED', 'reason': reason,
                          'privateKeyRead': False, 'productionDataRead': False, 'restoreStarted': False}))
        raise SystemExit(1)
