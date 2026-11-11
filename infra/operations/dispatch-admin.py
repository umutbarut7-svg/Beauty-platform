"""Dispatch one reviewed admin-only publication through the existing preview role."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request
import zlib

REPO = 'umutbarut7-svg/Beauty-platform'
EXPECTED_REQUEST_SHA = 'daa920efed6bbda587911ac75daf77eccaae5adb0daa91ef9436bd0eeef4a783'
APPLICATION = '94b6dd25a158cdd475e3b8005f8d263561304bf3'
GATES = [43046157094,43046157104,43046157195,43046157095,43046157079]

class Stop(Exception):
    pass

def require(condition, message):
    if not condition:
        raise Stop(message)

def request(path):
    return urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + path, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})

def github(path):
    with urllib.request.urlopen(request(path), timeout=20) as response:
        value = response.read(200001)
    require(len(value) <= 200000, 'GitHub response exceeded bound')
    return json.loads(value)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def transfer_url(artifact_id):
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request('actions/artifacts/' + str(artifact_id) + '/zip'), timeout=20):
            raise Stop('Expected a private artifact transfer redirect')
    except urllib.error.HTTPError as error:
        require(error.code == 302 and bool(error.headers.get('Location')), 'Artifact transfer unavailable')
        return error.headers['Location']

def aws(*args):
    require(args[:2] in [('sts','get-caller-identity'),('ssm','send-command'),('ssm','get-command-invocation')], 'Unsupported admin transport operation')
    result = subprocess.run(['aws',*args,'--region','eu-north-1','--output','json','--no-cli-pager','--cli-connect-timeout','5','--cli-read-timeout','20'], capture_output=True, text=True, timeout=35)
    require(result.returncode == 0, 'Admin transport unavailable; inspect before retry')
    return json.loads(result.stdout)


def validate_artifact(expected, artifact, run):
    require(artifact.get('id') == expected['id'] and artifact.get('digest') == 'sha256:'+expected['sha256'] and artifact.get('size_in_bytes') == expected['bytes'] and artifact.get('expired') is False, 'Immutable artifact identity/expiry differs')
    require(artifact.get('workflow_run',{}).get('id') == expected['run'] and artifact['workflow_run'].get('head_sha') == expected['head'], 'Artifact workflow source differs')
    require(run.get('id') == expected['run'] and run.get('head_sha') == expected['head'] and run.get('status') == 'completed' and run.get('conclusion') == 'success' and run.get('path') == '.github/workflows/admin-container-preparation.yml', 'Admin rehearsal is not successful on the pinned source')


def envelope(source, release, url):
    require(0 < len(source) <= 50000, 'Admin publication source exceeds bound')
    packed = base64.b64encode(zlib.compress(source,9)).decode()
    config = base64.b64encode(json.dumps({'release':release,'url':url}).encode()).decode()
    sha = hashlib.sha256(source).hexdigest()
    script = "python3 - <<'ORZELL_REVIEWED_ADMIN'\nimport base64,hashlib,json,zlib\ntry:\n source=zlib.decompress(base64.b64decode("+repr(packed)+",validate=True))\n if len(source)>50000 or hashlib.sha256(source).hexdigest()!="+repr(sha)+": raise ValueError()\n config=json.loads(base64.b64decode("+repr(config)+",validate=True))\n exec(compile(source,'reviewed-admin-publication','exec'),{'__name__':'__main__','RELEASE':config['release'],'TRANSFER_URL':config['url']})\nexcept BaseException:\n print('Reviewed admin publication stopped; private diagnostics withheld')\n raise SystemExit(1)\nORZELL_REVIEWED_ADMIN"
    require(len(script) <= 24000, 'Private admin envelope exceeds bound')
    return script


def main():
    require(os.environ.get('GITHUB_REPOSITORY') == REPO and os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Trusted main execution required')
    body = Path('.github/operations/admin-release.json').read_bytes()
    require(hashlib.sha256(body).hexdigest() == EXPECTED_REQUEST_SHA, 'Unreviewed admin release request')
    release = json.loads(body)
    identity = aws('sts','get-caller-identity')
    require(identity.get('Account') == '926642724499' and identity.get('Arn','').startswith('arn:aws:sts::926642724499:assumed-role/BeautyPlatformPreviewOperations/'), 'Unexpected preview identity')
    artifact = release['artifact']
    validate_artifact(artifact, github('actions/artifacts/'+str(artifact['id'])), github('actions/runs/'+str(artifact['run'])))
    for run_id in GATES:
        value = github('actions/runs/'+str(run_id))
        require(value.get('id') == run_id and value.get('head_sha') == APPLICATION and value.get('status') == 'completed' and value.get('conclusion') == 'success', 'Existing exact-source acceptance gate differs')
    source = Path('infra/operations/publish-admin.py').read_bytes()
    script = envelope(source,release,transfer_url(artifact['id']))
    result = aws('ssm','send-command','--instance-ids','i-09fe7fdb5f10d63b6','--document-name','AWS-RunShellScript','--parameters',json.dumps({'commands':[script],'executionTimeout':['900']}),'--comment','Reviewed admin-only publication '+os.environ['GITHUB_RUN_ID'])
    command_id = result['Command']['CommandId']
    require(re.fullmatch(r'[0-9a-f-]{36}',command_id), 'Unexpected command identity')
    print('SSM command: '+command_id,flush=True)
    for _ in range(100):
        time.sleep(8)
        value = aws('ssm','get-command-invocation','--command-id',command_id,'--instance-id','i-09fe7fdb5f10d63b6')
        if value['Status'] not in ['Pending','InProgress','Delayed']: break
    else:
        raise Stop('Monitoring deadline; command may still run. Inspect before any resend.')
    output = value.get('StandardOutputContent','')
    require(len(output) <= 24000, 'Admin operation output exceeds bound')
    print('SSM status: '+value['Status']);print(output)
    require(value['Status'] == 'Success' and 'COMPLETED: immutable admin' in output, 'Admin publication did not complete; inspect before retry')
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as summary:
        summary.write('## Admin-only publication\n\nSSM command: `'+command_id+'`\n\n'+output+'\n')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Admin publication dispatch stopped; private diagnostics withheld. Inspect before retry.')
        raise SystemExit(1)
