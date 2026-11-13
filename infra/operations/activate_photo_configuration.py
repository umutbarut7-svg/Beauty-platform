#!/usr/bin/env python3
"""Activate the staged photo notice only under the owner's explicit instruction."""

import argparse
import hashlib
import json
import pathlib
import secrets
import tempfile
import urllib.error
import urllib.request

from stage_photo_configuration import (
    ROOT, PreflightError, StagingError, apply_staging, compose_prefix, inspect,
    run, validate_baseline, validate_candidate,
)

NOTICE_SHA256 = 'ab512ef4d7defbc951079ca6ebbfcd22fb1402d156ebef6ac76cfb5cc23c96f2'


def active_settings(candidate):
    staged = validate_candidate(candidate)
    if staged['MVP_PHOTO_POLICY_VERSION'] != 'orzell-photo-2026-10-27-draft-1':
        raise PreflightError('Unexpected staged policy version')
    if hashlib.sha256(staged['MVP_PHOTO_NOTICE'].encode()).hexdigest() != NOTICE_SHA256:
        raise PreflightError('Notice differs from the prepared review candidate')
    return staged, {
        **staged,
        'MVP_PHOTO_POLICY_VERSION': 'orzell-photo-2026-10-27-v1',
        'MVP_PHOTO_POLICY_REVIEWED': 'true',
        'MVP_AI_ENABLED': 'true',
    }


def authenticated_acceptance(settings):
    base = 'https://preview.13-51-112-228.sslip.io/api'

    def request(path, expected, method='GET', data=None, token=None):
        headers = {'Content-Type': 'application/json'} if data is not None else {}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        query = urllib.request.Request(base + path, method=method, headers=headers,
                                       data=json.dumps(data).encode() if data is not None else None)
        try:
            with urllib.request.urlopen(query, timeout=20) as reply:
                if reply.status != expected:
                    raise StagingError('Authenticated acceptance returned unexpected status')
                raw = reply.read(100000)
        except urllib.error.HTTPError:
            raise StagingError('Authenticated photo capability acceptance failed') from None
        return json.loads(raw) if raw else None

    # This creates only a private, synthetic customer session; no photo or AI call.
    session = request('/auth/register', 201, 'POST', {
        'email': 'orzell-photo-probe-' + secrets.token_hex(12) + '@example.test',
        'password': secrets.token_urlsafe(32),
    })
    try:
        policy = request('/mvp/v1/photos/policy', 200, token=session['accessToken'])
        actual = policy.get('policy') or {}
        if not policy.get('available') or actual.get('version') != settings['MVP_PHOTO_POLICY_VERSION'] or actual.get('retentionHours') != 24 or actual.get('notice') != settings['MVP_PHOTO_NOTICE']:
            raise StagingError('Live authenticated photo capability does not match approved configuration')
        print('Authenticated public HTTPS photo capability AVAILABLE, version, notice and retention: PASS', flush=True)
    finally:
        request('/auth/logout', 204, 'POST', {'refreshToken': session['refreshToken']})
        print('Synthetic refresh session logged out: PASS', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=pathlib.Path, required=True)
    parser.add_argument('--approved-photo-activation', action='store_true')
    args = parser.parse_args()
    staged, settings = active_settings(json.loads(args.candidate.read_text(encoding='utf-8')))
    if not args.approved_photo_activation:
        print('PLAN ONLY: enable photo/AI with prepared owner-requested notice v1, 24h/90d retention and existing request quotas.')
        print('A failed authenticated capability check rolls both target services back to their closed-gate settings.')
        return
    plans = {}
    for service in ['api', 'worker']:
        before = inspect(service)
        prefix = compose_prefix(before)
        effective = json.loads(run(prefix + ['config', '--format', 'json']))['services'][service]
        env = validate_baseline(service, before, effective, existing_policy=staged)
        if env.get('MVP_AI_DAILY_REQUEST_LIMIT') != '5' or env.get('MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT') != '20':
            raise PreflightError('Runtime request quotas differ from the inspected configuration')
        plans[service] = (before, prefix, env)
    folder = pathlib.Path(tempfile.mkdtemp(prefix='photo-activation-', dir=ROOT / 'operations'))
    apply_staging(plans, folder, settings, acceptance=lambda: authenticated_acceptance(settings))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if isinstance(error, (PreflightError, StagingError)):
            print('Photo activation stopped: ' + str(error), flush=True)
        else:
            print('Photo activation stopped: ' + type(error).__name__ + '; raw diagnostics suppressed', flush=True)
        print('No successful activation is claimed.', flush=True)
        raise SystemExit(1) from None
