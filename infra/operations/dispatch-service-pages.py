"""Dispatch the single service-pages release using the existing preview transport."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('preview_transport', HERE/'dispatch-admin.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
require = transport.require
APPLICATION = '0fae2655395df7dcbd580f1ab85295b1d3a6e1f3'
GATES = [44527207911, 44527207936, 44527208040, 44527207980, 44527208036]
INSTANCE = 'i-09fe7fdb5f10d63b6'


def pinned_request():
    body = Path('.github/operations/service-pages-release.json').read_bytes()
    require(hashlib.sha256(body).hexdigest() == '9be1a46aa18ff52239ed94c6de66ec4e51f8697987415347a78c88b67fd276e4',
            'Preview release request differs')
    return json.loads(body)


def bundle():
    # The remote host uses the same reviewed read-only inspection and Compose helpers as admin publication.
    helpers = (HERE/'publish-admin.py').read_bytes()
    caddy = Path('infra/preview/Caddyfile').read_text()
    source = (HERE/'publish-service-pages.py').read_text()
    return ('import types, sys\nops = types.ModuleType("preview_admin_ops")\n'
            'sys.modules[ops.__name__] = ops\nexec(' + repr(helpers) + ',ops.__dict__)\n' +
            source + '\nmain(RELEASE, TRANSFER_URL, ' + repr(caddy) + ')\n').encode()


def verify_gate(run, head):
    require(run.get('head_sha') == head and run.get('status') == 'completed' and
            run.get('conclusion') == 'success', 'Required exact-source check differs')


def main():
    require(os.environ.get('GITHUB_REPOSITORY') == transport.REPO and
            os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Trusted preview release branch required')
    release = pinned_request()
    expected = release['artifact']
    artifact = transport.github('actions/artifacts/'+str(expected['id']))
    require(artifact.get('id') == expected['id'] and artifact.get('name') == 'orzell-preview-service-images'
            and artifact.get('digest') == 'sha256:'+expected['sha256'] and
            artifact.get('size_in_bytes') == expected['bytes'] and artifact.get('expired') is False and
            artifact['workflow_run']['id'] == expected['run'] and artifact['workflow_run']['head_sha'] == expected['head'],
            'Prepared artifact identity or expiry differs')
    build = transport.github('actions/runs/'+str(expected['run']))
    require(build['path'] == '.github/workflows/preview-service-images.yml', 'Image workflow differs')
    verify_gate(build, expected['head'])
    for run_id in GATES + [44527240735]:
        verify_gate(transport.github('actions/runs/'+str(run_id)), APPLICATION if run_id in GATES else expected['head'])
    identity = transport.aws('sts','get-caller-identity')
    require(identity.get('Arn','').startswith('arn:aws:sts::926642724499:assumed-role/BeautyPlatformPreviewOperations/'),
            'Preview identity differs')
    script = transport.envelope(bundle(), release, transport.transfer_url(expected['id']))
    result = transport.aws('ssm','send-command','--instance-ids',INSTANCE,'--document-name','AWS-RunShellScript',
                           '--parameters',json.dumps({'commands':[script],'executionTimeout':['900']}),
                           '--comment','Reviewed service pages preview '+os.environ['GITHUB_RUN_ID'])
    command = result['Command']['CommandId']
    require(bool(re.fullmatch(r'[0-9a-f-]{36}', command)), 'Unexpected operation identifier')
    print('Preview operation '+command, flush=True)
    for _ in range(115):
        time.sleep(8)
        state = transport.aws('ssm','get-command-invocation','--command-id',command,'--instance-id',INSTANCE)
        if state['Status'] not in ['Pending','InProgress','Delayed']:
            break
    output = state.get('StandardOutputContent','')
    require(len(output) < 24000, 'Unexpected operation output size')
    print(output)
    require(state['Status'] == 'Success' and 'COMPLETED: public service pages verified' in output,
            'Service publication incomplete; inspect the operation before retrying')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, transport.Stop) else 'Dispatch stopped; private diagnostics withheld')
        raise SystemExit(1)
