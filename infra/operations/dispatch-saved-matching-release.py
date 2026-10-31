"""Send one fixed, owner-approved publication through the existing SSM role."""
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
ARTIFACT = 13034118862
RUN = 41179806354
HEAD = 'd28f7903a54fa33d58baa7a6ca2c896f01c4d6c8'
DIGEST = 'sha256:1cc1bfc11fc8aef672f0e9ff5abf04beceb0c21c70a769b8a53f6a17981780f0'
REQUEST = {'request_id': 'orzell-saved-matching-publication-20261031-2', 'source': '4fdfbe61405633ce85764c0b2a13e157bc9e5833', 'artifact_id': ARTIFACT, 'mode': 'approved-maintenance'}


class Stop(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Stop(message)


def aws(*args):
    result = subprocess.run(['aws', *args, '--region', 'eu-north-1', '--output', 'json', '--no-cli-pager', '--cli-connect-timeout', '5', '--cli-read-timeout', '20'], capture_output=True, text=True, timeout=35)
    require(result.returncode == 0, 'AWS command failed; inspect before retry')
    return json.loads(result.stdout)


def request(path):
    return urllib.request.Request('https://api.github.com/repos/' + REPO + '/' + path, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})


def github(path):
    with urllib.request.urlopen(request(path), timeout=20) as response:
        value = response.read(200001)
    require(len(value) <= 200000, 'GitHub response exceeded bound')
    return json.loads(value)


def validate_artifact(artifact, run):
    require(artifact.get('id') == ARTIFACT and artifact.get('digest') == DIGEST and artifact.get('expired') is False and artifact.get('size_in_bytes') == 771720992, 'Immutable artifact identity/expiry mismatch')
    require(artifact.get('workflow_run', {}).get('id') == RUN and artifact['workflow_run'].get('head_sha') == HEAD, 'Artifact source mismatch')
    require(run.get('id') == RUN and run.get('head_sha') == HEAD and run.get('status') == 'completed' and run.get('conclusion') == 'success', 'Image rehearsal was not successful on the pinned head')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def transfer_url():
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request('actions/artifacts/' + str(ARTIFACT) + '/zip'), timeout=20):
            raise Stop('Expected a private artifact transfer redirect')
    except urllib.error.HTTPError as error:
        require(error.code == 302 and bool(error.headers.get('Location')), 'Artifact transfer unavailable')
        return error.headers['Location']


def envelope(source, url):
    require(0 < len(source) <= 50000, 'Publication source size outside bounds')
    packed = base64.b64encode(zlib.compress(source, 9)).decode()
    config = base64.b64encode(json.dumps({'url': url}).encode()).decode()
    digest = hashlib.sha256(source).hexdigest()
    # URL is private SSM input, never CI output, an artifact or an environment dump.
    script = "python3 - <<'ORZELL_REVIEWED_PUBLICATION'\nimport base64,hashlib,json,zlib\ntry:\n source=zlib.decompress(base64.b64decode(" + repr(packed) + ",validate=True))\n if len(source)>50000 or hashlib.sha256(source).hexdigest()!=" + repr(digest) + ": raise ValueError()\n config=json.loads(base64.b64decode(" + repr(config) + ",validate=True))\n exec(compile(source,'reviewed-publication','exec'),{'__name__':'__main__','TRANSFER_URL':config['url']})\nexcept BaseException:\n print('Reviewed publication stopped; private diagnostics withheld')\n raise SystemExit(1)\nORZELL_REVIEWED_PUBLICATION"
    require(len(script) <= 24000, 'Private SSM envelope exceeded bound')
    return script


def main():
    require(os.environ.get('GITHUB_REPOSITORY') == REPO and os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Trusted main execution required')
    require(json.loads(Path('.github/operations/saved-matching-release.json').read_text()) == REQUEST, 'Unsupported release request')
    identity = aws('sts', 'get-caller-identity')
    require(identity.get('Account') == '926642724499' and identity.get('Arn', '').startswith('arn:aws:sts::926642724499:assumed-role/BeautyPlatformPreviewOperations/'), 'Unexpected preview identity')
    validate_artifact(github('actions/artifacts/' + str(ARTIFACT)), github('actions/runs/' + str(RUN)))
    source = Path('infra/operations/publish-saved-matching.py').read_bytes()
    script = envelope(source, transfer_url())
    result = aws('ssm', 'send-command', '--instance-ids', 'i-09fe7fdb5f10d63b6', '--document-name', 'AWS-RunShellScript', '--parameters', json.dumps({'commands': [script], 'executionTimeout': ['900']}), '--comment', 'Owner-approved saved matching release ' + os.environ['GITHUB_RUN_ID'])
    command_id = result['Command']['CommandId']
    require(bool(re.fullmatch(r'[0-9a-f-]{36}', command_id)), 'Unexpected SSM command identity')
    print('SSM command: ' + command_id, flush=True)
    for _ in range(100):
        time.sleep(10)
        status = aws('ssm', 'get-command-invocation', '--command-id', command_id, '--instance-id', 'i-09fe7fdb5f10d63b6')
        if status['Status'] not in ['Pending', 'InProgress', 'Delayed']:
            break
    else:
        raise Stop('Monitoring deadline; command may still run. Do not resend without inspection.')
    print('SSM status: ' + status['Status'])
    output = status.get('StandardOutputContent', '')
    require(len(output) <= 24000, 'Publication output exceeded bound')
    print(output)
    require(status['Status'] == 'Success' and 'COMPLETED: reviewed migration, API and privacy worker verified' in output, 'Publication did not complete; inspect the command before retry')
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write('## Approved preview saved matching release\n\nSSM command: `' + command_id + '`\n\n' + output + '\n\nNo TestFlight or store action performed by this workflow.\n')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, Stop) else 'Release dispatch stopped; private diagnostics withheld. Inspect before retry.')
        raise SystemExit(1)
