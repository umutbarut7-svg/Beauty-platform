"""Inspect the failed approved preparation through the existing bounded bridge."""
import importlib.util
import json
import os
from pathlib import Path
import time

spec = importlib.util.spec_from_file_location('existing_dispatch', 'infra/operations/dispatch-saved-matching-release.py')
dispatch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dispatch)


def main():
    dispatch.require(os.environ.get('GITHUB_REPOSITORY') == dispatch.REPO and os.environ.get('GITHUB_REF') == 'refs/heads/main', 'Trusted main required')
    dispatch.require(json.loads(Path('.github/operations/saved-matching-inspection.json').read_text()) == {'request_id': 'saved-matching-preparation-inspection-20261031-1', 'mode': 'inspect'}, 'Unexpected inspection request')
    identity = dispatch.aws('sts', 'get-caller-identity')
    dispatch.require(identity.get('Account') == '926642724499' and identity.get('Arn', '').startswith('arn:aws:sts::926642724499:assumed-role/BeautyPlatformPreviewOperations/'), 'Unexpected identity')
    source = Path('infra/operations/inspect-saved-matching-publication.py').read_bytes()
    script = dispatch.envelope(source, 'UNUSED_BY_READONLY_INSPECTION')
    reply = dispatch.aws('ssm', 'send-command', '--instance-ids', 'i-09fe7fdb5f10d63b6', '--document-name', 'AWS-RunShellScript', '--parameters', json.dumps({'commands': [script], 'executionTimeout': ['120']}), '--comment', 'Approved publication preparation inspection ' + os.environ['GITHUB_RUN_ID'])
    command = reply['Command']['CommandId']
    print('Inspection SSM command: ' + command, flush=True)
    for _ in range(25):
        time.sleep(5)
        result = dispatch.aws('ssm', 'get-command-invocation', '--command-id', command, '--instance-id', 'i-09fe7fdb5f10d63b6')
        if result['Status'] not in ['Pending', 'InProgress', 'Delayed']:
            break
    else:
        raise dispatch.Stop('Inspection deadline; inspect command before retry')
    print('Inspection status: ' + result['Status'])
    print(result.get('StandardOutputContent', ''))
    dispatch.require(result['Status'] == 'Success', 'Inspection did not complete')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, dispatch.Stop) else 'Inspection stopped; private diagnostics withheld')
        raise SystemExit(1)
