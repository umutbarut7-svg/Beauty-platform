#!/usr/bin/env python3
"""Stage a photo notice and retention settings; never enable photo/AI gates."""

import argparse
import json
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.request

ROOT = pathlib.Path('/opt/epifiz')
PROJECT = 'beauty-preview'
EXPECTED_IMAGE = {
    'api': 'sha256:2b21a3c1dfa5f60f07cf04a1d1e741396f40b8ff7a86a79c9e74831810ce8f64',
    'worker': 'sha256:d6f15b40595f4abce6e4c5c185158a292d10dea9b1057288e67dff5049633dfe',
}
FIELDS = {
    'MVP_PHOTO_POLICY_REVIEWED', 'MVP_AI_ENABLED', 'MVP_SEMANTIC_ENABLED',
    'MVP_PHOTO_POLICY_VERSION', 'MVP_PHOTO_NOTICE',
    'MVP_PHOTO_RETENTION_HOURS', 'MVP_PHOTO_AUDIT_RETENTION_DAYS',
}
GATES = ['MVP_PHOTO_POLICY_REVIEWED', 'MVP_AI_ENABLED', 'MVP_SEMANTIC_ENABLED']
CREDENTIAL = re.compile(r'PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|AWS_ACCESS_KEY', re.I)


class PreflightError(ValueError):
    """Only fixed, non-secret diagnostic messages may use this type."""


class StagingError(RuntimeError):
    """Only fixed, non-secret diagnostic messages may use this type."""


def run(args, timeout=30):
    reply = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if reply.returncode:
        raise StagingError('Command failed; raw output suppressed')
    return reply.stdout


def inspect(service):
    return json.loads(run(['docker', 'inspect', f'{PROJECT}-{service}-1']))[0]


def environment(container):
    values = dict(item.split('=', 1) for item in container['Config'].get('Env', []) if '=' in item)
    if any(CREDENTIAL.search(name) for name in values):
        raise StagingError('Credential-bearing container configuration; staging blocked')
    return values


def validate_candidate(candidate):
    if set(candidate) != {'services'} or set(candidate['services']) != {'api', 'worker'}:
        raise PreflightError('Only API and worker may be configured')
    settings = []
    for service in ['api', 'worker']:
        value = candidate['services'][service]
        if set(value) != {'environment'} or set(value['environment']) != FIELDS:
            raise PreflightError('Unexpected candidate field')
        env = value['environment']
        if not all(isinstance(value, str) for value in env.values()):
            raise PreflightError('Environment settings must be strings')
        if any(env[name] != 'false' for name in GATES):
            raise PreflightError('This operation cannot enable photo or AI')
        if env['MVP_PHOTO_RETENTION_HOURS'] != '24' or env['MVP_PHOTO_AUDIT_RETENTION_DAYS'] != '90':
            raise PreflightError('Retention differs from the recorded owner decision')
        if not 0 < len(env['MVP_PHOTO_NOTICE']) <= 10000:
            raise PreflightError('Notice is missing or too long')
        if not 0 < len(env['MVP_PHOTO_POLICY_VERSION']) <= 100 or 'draft' not in env['MVP_PHOTO_POLICY_VERSION']:
            raise PreflightError('A pending draft version is required')
        settings.append(env)
    if settings[0] != settings[1]:
        raise PreflightError('API and worker settings differ')
    return settings[0]


def checked_path(raw):
    value = pathlib.Path(raw)
    if not value.is_absolute() or not value.resolve().is_relative_to(ROOT.resolve()) or value.is_symlink():
        raise PreflightError('Runtime path outside approved root')
    if not value.exists():
        raise PreflightError('Runtime path missing')
    return value


def compose_prefix(container):
    labels = container['Config'].get('Labels', {})
    if labels.get('com.docker.compose.project') != PROJECT:
        raise PreflightError('Unexpected Compose project')
    folder = checked_path(labels.get('com.docker.compose.project.working_dir', ''))
    files = labels.get('com.docker.compose.project.config_files', '').split(',')
    envfile = checked_path(labels.get('com.docker.compose.project.environment_file', ''))
    if not files or any(not name for name in files):
        raise PreflightError('Runtime Compose source missing')
    command = ['docker', 'compose', '-p', PROJECT, '--project-directory', str(folder), '--env-file', str(envfile)]
    for name in files:
        command += ['-f', str(checked_path(name))]
    return command


def validate_baseline(service, container, config, existing_policy=None):
    env = environment(container)
    if container['Image'] != EXPECTED_IMAGE[service] or not container['State'].get('Running'):
        raise PreflightError('Runtime release changed; no replacement')
    if any(env.get(name) != 'false' for name in GATES) or env.get('STAGE33_MVP_ENABLED') != 'true':
        raise PreflightError('Runtime gates changed; no replacement')
    policy_fields = ['MVP_PHOTO_NOTICE', 'MVP_PHOTO_POLICY_VERSION', 'MVP_PHOTO_RETENTION_HOURS', 'MVP_PHOTO_AUDIT_RETENTION_DAYS']
    if existing_policy is None:
        if any(env.get(name) for name in policy_fields):
            raise PreflightError('Existing policy settings require separate review')
    elif any(env.get(name) != existing_policy.get(name) for name in policy_fields):
        raise PreflightError('Staged notice or retention differs from activation candidate')
    if any(env.get(key) != str(value) for key, value in config.get('environment', {}).items()):
        raise PreflightError('Compose environment differs from the running service')
    image = json.loads(run(['docker', 'image', 'inspect', config['image']]))[0]
    if image['Id'] != container['Image']:
        raise PreflightError('Compose image differs from running image')
    command = config.get('command')
    if command is None:
        command = image.get('Config', {}).get('Cmd')
    if command != container['Config'].get('Cmd'):
        raise PreflightError('Compose command differs from running command')
    entrypoint = config.get('entrypoint')
    if entrypoint is None:
        # Compose null means inherit the image's default, not an empty entrypoint.
        entrypoint = image.get('Config', {}).get('Entrypoint')
    if entrypoint != container['Config'].get('Entrypoint'):
        raise PreflightError('Compose entrypoint differs from running entrypoint')
    if config.get('ports') or config.get('volumes') or container.get('Mounts') or container['HostConfig'].get('PortBindings'):
        raise PreflightError('Unexpected target mount or published port')
    return env


def verify_service(service, expected):
    for _ in range(45):
        value = inspect(service)
        state = value['State']
        env = environment(value)
        if value['Image'] != EXPECTED_IMAGE[service] or env != expected:
            raise StagingError('Image or environment changed unexpectedly')
        if state.get('OOMKilled') or state.get('Status') in ['dead', 'exited']:
            raise StagingError('Service did not remain running')
        if service == 'api' and state.get('Health', {}).get('Status') == 'healthy':
            return
        if service == 'worker' and state.get('Running'):
            queue, seen = [state.get('Pid', 0)], set()
            try:
                while queue and len(seen) < 32:
                    pid = queue.pop()
                    if not pid or pid in seen:
                        continue
                    seen.add(pid)
                    folder = pathlib.Path('/proc') / str(pid)
                    args = (folder / 'cmdline').read_bytes().split(b'\0')
                    if any(arg.endswith(b'dist/worker.js') for arg in args) and b'--once' not in args:
                        return
                    queue.extend(int(item) for item in (folder / 'task' / str(pid) / 'children').read_text().split())
            except (OSError, ValueError):
                pass
        time.sleep(2)
    raise StagingError('Service readiness deadline reached')


def apply_staging(plans, folder, settings, acceptance=None):
    attempted = []
    unchanged = {name: inspect(name)['Id'] for name in ['postgres', 'prepare-secrets', 'gateway', 'admin']}
    try:
        for service in ['worker', 'api']:
            before, prefix, env = plans[service]
            # A changed deployment between preflight and apply blocks that service.
            if inspect(service)['Id'] != before['Id']:
                raise StagingError('Concurrent service replacement detected')
            after_path, rollback_path = folder / f'{service}.json', folder / f'{service}-rollback.json'
            for path, selected in [(after_path, settings), (rollback_path, env)]:
                data = {'services': {service: {'image': before['Image'], 'environment': selected}}}
                with path.open('x', encoding='utf-8') as handle:
                    json.dump(data, handle, ensure_ascii=False, indent=2)
                path.chmod(0o600)
            attempted.append((service, before, prefix, env, rollback_path))
            run(prefix + ['-f', str(after_path), 'up', '-d', '--no-deps', '--pull', 'never', '--no-build', service], timeout=120)
            verify_service(service, {**env, **settings})
            print(service + ' staged, same image, readiness and environment agreement: PASS', flush=True)
        for host in ['preview.13-51-112-228.sslip.io', 'admin.13-51-112-228.sslip.io']:
            with urllib.request.urlopen('https://' + host + '/api/health/ready', timeout=10) as reply:
                if reply.status != 200:
                    raise StagingError('Public API readiness failed')
        if any(inspect(name)['Id'] != identity for name, identity in unchanged.items()):
            raise StagingError('Unrelated service replacement detected')
        if acceptance is not None:
            acceptance()
    except Exception:
        restored = True
        for service, before, prefix, env, rollback_path in reversed(attempted):
            try:
                # Do not overwrite a concurrent release that uses a different image.
                if inspect(service)['Image'] != before['Image']:
                    raise StagingError('Concurrent release prevents automatic rollback')
                run(prefix + ['-f', str(rollback_path), 'up', '-d', '--no-deps', '--pull', 'never', '--no-build', service], timeout=120)
                verify_service(service, env)
            except Exception:
                restored = False
        print('Rollback verification: ' + ('PASS' if restored else 'MANUAL_REVIEW_REQUIRED'), flush=True)
        raise StagingError('Staging did not pass; see rollback status') from None
    if all(settings.get(name) == 'false' for name in GATES):
        print('Photo notice/retention staged; AI, semantic and policy gates remain FALSE.', flush=True)
    else:
        print('Owner-requested photo/AI activation applied; semantic matching unchanged.', flush=True)
    print('Database, secret helper, gateway and admin container identities unchanged: PASS', flush=True)
    print('No customer photo, paid model call, new resource or migration performed.', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', required=True, type=pathlib.Path)
    parser.add_argument('--approved-staging', action='store_true')
    args = parser.parse_args()
    settings = validate_candidate(json.loads(args.candidate.read_text(encoding='utf-8')))
    if not args.approved_staging:
        print('PLAN ONLY: configure the draft notice and 24-hour/90-day lifetimes for API and worker; keep all photo/AI gates closed.')
        print('Apply uses each service\'s own Compose sources, pins its current image, and rolls back on failed readiness.')
        print('No Docker/AWS requests, filesystem writes or runtime changes performed.')
        return
    plans = {}
    for service in ['api', 'worker']:
        before = inspect(service)
        prefix = compose_prefix(before)
        effective = json.loads(run(prefix + ['config', '--format', 'json']))['services'][service]
        plans[service] = (before, prefix, validate_baseline(service, before, effective))
    parent = ROOT / 'operations'
    folder = pathlib.Path(tempfile.mkdtemp(prefix='photo-staging-', dir=parent))
    apply_staging(plans, folder, settings)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if isinstance(error, (PreflightError, StagingError)):
            print('Photo staging stopped: ' + str(error), flush=True)
        else:
            print('Photo staging stopped: ' + type(error).__name__ + '; raw diagnostics suppressed', flush=True)
        print('No activation is claimed.', flush=True)
        raise SystemExit(1) from None
