#!/usr/bin/env python3
"""Explicit generated-data transport check; no key, backup or restore operation."""
import base64, hashlib, json, os, pty, selectors, shlex, signal, subprocess, sys, time
EXPECTED = '36c921f3eb0f31bfaadb479e63c20f4904d9034fa59234da58cea7ede0644c3a'
REMOTE_PATH = '/opt/orzell-recovery-runtime/infra/operations/run-recovery-session.py'

def probe_command(path=REMOTE_PATH, digest=EXPECTED, local=False):
    source = ('import hashlib,json,pathlib,runpy,time\n'
              'p=pathlib.Path('+repr(path)+')\n'
              'if hashlib.sha256(p.read_bytes()).hexdigest()!='+repr(digest)+': raise ValueError("PINNED_RUNNER_REQUIRED")\n'
              'r=runpy.run_path(str(p))\n'
              'print("ORZELL_PROBE_READY",flush=True)\n'
              'v=r["read_frame"](time.monotonic()+8)\n'
              'print("ORZELL_PROBE_RESULT "+json.dumps({"bytes":len(v),"sha256":hashlib.sha256(v).hexdigest()}),flush=True)\n')
    if local:
        return ['timeout','15','python3','-u','-c',source]
    account = subprocess.check_output(['aws','sts','get-caller-identity','--region','eu-north-1','--query','Account','--output','text','--no-cli-pager'],text=True,timeout=20).strip()
    if account != '926642724499':
        raise ValueError('OWNER_ACCOUNT_MISMATCH')
    parameters = {'command':['sudo timeout 15 python3 -u -c '+shlex.quote(source)]}
    return ['aws','ssm','start-session','--region','eu-north-1','--target','i-09ec5394961521689','--document-name','AWS-StartInteractiveCommand','--parameters',json.dumps(parameters)]

def run(command):
    payload = b'ORZELL_GENERATED_NON_SECRET_PROBE_'*400
    encoded = base64.b64encode(payload)
    frame = b'ORZELL-CAPSULE-V1\n'+b'\n'.join(encoded[i:i+256] for i in range(0,len(encoded),256))+b'\nEND-ORZELL-CAPSULE\n'
    master, slave = pty.openpty()
    process = None
    sent, observed = False, False
    pending = b''
    try:
        process = subprocess.Popen(command,stdin=subprocess.PIPE,stdout=slave,stderr=slave,start_new_session=True)
        os.close(slave)
        slave = None
        deadline = time.monotonic()+35
        with selectors.DefaultSelector() as selector:
            selector.register(master,selectors.EVENT_READ)
            while time.monotonic()<deadline:
                if not selector.select(max(0,deadline-time.monotonic())):
                    break
                try:
                    chunk=os.read(master,4096)
                except OSError:
                    break
                if not chunk:
                    break
                pending+=chunk
                if len(pending)>65536:
                    raise ValueError('PROBE_OUTPUT_LIMIT')
                while b'\n' in pending:
                    line,pending=pending.split(b'\n',1)
                    line=line.strip(b'\r')
                    if line==b'ORZELL_PROBE_READY' and not sent:
                        process.stdin.write(frame)
                        process.stdin.flush()
                        sent=True
                    elif line.startswith(b'ORZELL_PROBE_RESULT '):
                        value=json.loads(line[len(b'ORZELL_PROBE_RESULT '):])
                        observed=(value=={'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()})
        code=process.wait(timeout=3) if process.poll() is None else process.returncode
        observed=observed and code==0
        print(json.dumps({'status':'GENERATED_FRAME_TRANSPORT_PASSED' if observed else 'GENERATED_FRAME_TRANSPORT_NOT_VERIFIED','generatedBytes':len(payload),'frameBytes':len(frame),'exactPayloadMatched':observed,'privateKeyRead':False,'productionDataRead':False,'restoreStarted':False}),flush=True)
        return observed
    finally:
        if process is not None:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL)
                    process.wait(timeout=3)
            if process.stdin:
                process.stdin.close()
        os.close(master)
        if slave is not None:
            os.close(slave)

if __name__=='__main__':
    if sys.argv[1:] != ['--probe-generated-frame']:
        print(json.dumps({'status':'OFFLINE_NO_ACTION' if len(sys.argv)==1 else 'UNSUPPORTED_PROBE_ARGUMENTS','privateKeyRead':False,'productionDataRead':False,'restoreStarted':False}))
        raise SystemExit(0 if len(sys.argv)==1 else 2)
    try:
        run(probe_command())
    except Exception:
        print(json.dumps({'status':'GENERATED_FRAME_TRANSPORT_NOT_VERIFIED','privateKeyRead':False,'productionDataRead':False,'restoreStarted':False}))
