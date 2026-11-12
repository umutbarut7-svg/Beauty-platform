#!/usr/bin/env python3
"""Prepare a separately scoped recovery runtime; no key or backup intake."""
import argparse
from decimal import Decimal, InvalidOperation
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re

ROOT = Path(__file__).parent
SOURCE = "0db36282e3a2221e391c2649d29735a3fd8e2d0b"
STACK = "orzell-protected-runtime-v1"
REGION = "eu-north-1"
ACCOUNT = "926642724499"
TOKEN = "orzell-protected-runtime-20261112-v1"
MAX_ESTIMATE = Decimal("0.06")
IMAGE = "pgvector/pgvector@sha256:01215e09bd4bd582d20230e025b6c971deeeffee49ceef1aae167e839cb62a7e"
STACK_RE = re.compile("arn:aws:cloudformation:" + REGION + ":" + ACCOUNT + ":stack/" + STACK + "/[A-Za-z0-9-]+")
HELPER_PINS = {
    "plan-recovery-host.py": "7dd983a7905f04f49a24d44331368dd0f97fd2698785c93fb50a8cb9684e1206",
    "start-small-recovery.py": "65dca7b34c7dbf1e2e233d8181546868dd2643842221325c7d798ec039766ecb"
}  # Filled from exact Git blob bytes before review.
RUNTIME_PINS = {
    ".github/operations/backup-recipient-20261105.pem": "fc893294cf4b7b1ce927ef86fa05b078b6f82804459da3161b072b884835f276",
    ".github/operations/backup-signing-public-20261105.pem": "39dd7914d95b708efe7d0478a5039a1a358b26d3aaf6d754b965cd5e42151745",
    ".github/operations/recovery-schema-reference-2e56def.json": "6ca4b7c1d0fe76939b2fa3b1f9f9700e55d92b7ba43e4dbefbc9423009f2d94c",
    ".github/operations/recovery-snapshot-20261112.json": "eb3c0c0e8853b0a0633b7b140f11ec6d8e9f1f36f5087060dfda4a9319158160",
    "infra/operations/backup-manifest.py": "2ad7d7c7634c9de033535a13483f5a899eda23fb1a3f87819a44ebed673f7a43",
    "infra/operations/encrypted-backup.py": "1753d75e1e8cac0f2ff6217d92eb3918465275f24b81b7cdffa1debe20e4b3f3",
    "infra/operations/inspect-recovery-package.py": "a16f61f06815e96f9742bab16345ca73872644efcb3e7ca5f39d23072ade7657",
    "infra/operations/quarantine-recovery-access.sql": "7561eb15c7fb86d332cb86a8e939d84411cf0220e50fed14fa206f58dd969727",
    "infra/operations/recover-backup-memory.py": "e53a2f6a838703721fb1a46a4539f080933155fdbbd9b2083e611989940375d0",
    "infra/operations/recover-backup-package.py": "2c6089efb7d1858aef7ea61b13d6040a6e28657da730501df807904e517af6fa",
    "infra/operations/recovery-catalog.sql": "1e7e22e98e3d370f1a5fe809f1248df6c142a5baa208e4456dc194f2f24f57be",
    "infra/operations/recovery-domain-check.sql": "785c2c28f9d6339266b7c674aea8fe647e2aaaeff5fd2f492f230facd0f28066",
    "infra/operations/recovery-key-handoff.py": "6dc4e43a1b05bb1d5e838e1831e90dbc650f1bd8acda857f6abbd0702d3fc763",
    "infra/operations/recovery-quarantine-check.sql": "0783d6d1ea5d34253b9971f652474f85b4319f11451a3359b4d35b70e06944de",
    "infra/operations/restore-backup-isolated.py": "356e19bd5058b2fe4bc15caf284b75ccc20533616eaaec0d8ae1f27c7b6d1e0e",
    "infra/operations/restore-protected-handoff.py": "938d08ff1ef8bb5d71d121e3f9e62de455becf651e5ded445408fd50e43154b5",
    "infra/operations/verified-backup.py": "7dfda5a588650a209ebe2705fd71bdb455f7ffe1917f4e1230a2559e52245c94"
}  # Fixed public code/certificates only; no backup or private key.


def load(name, filename):
    path = ROOT / filename
    if hashlib.sha256(path.read_bytes()).hexdigest() != HELPER_PINS.get(filename):
        raise ValueError("PINNED_PLANNING_HELPER_REQUIRED")
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def modules():
    legacy = load("prepared_runtime_owner", "start-small-recovery.py")
    base = load("prepared_runtime_base", "plan-recovery-host.py")
    # Reuse existing identity/eligibility/price/orphan-inventory boundaries for
    # this distinct stack. The original module/template is not changed on disk.
    legacy.STACK, legacy.STACK_RE = STACK, STACK_RE
    base.INSTANCE = "t3.small"
    return legacy, base


def bootstrap():
    if len(RUNTIME_PINS) != 17 or not re.fullmatch(r"[0-9a-f]{40}", SOURCE):
        raise ValueError("FIXED_PUBLIC_RUNTIME_REQUIRED")
    downloads = []
    for path, digest in sorted(RUNTIME_PINS.items()):
        if (not re.fullmatch(r"(?:infra/operations|\.github/operations)/[A-Za-z0-9_.-]+", path)
                or ".." in Path(path).parts or not re.fullmatch(r"[0-9a-f]{64}", digest)):
            raise ValueError("FIXED_PUBLIC_RUNTIME_REQUIRED")
        target = "/opt/orzell-recovery-runtime/" + path
        downloads += ["curl --connect-timeout 5 --max-time 15 --max-filesize 262144 --proto '=https' --tlsv1.2 -fsS 'https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/" + SOURCE + "/" + path + "' -o '" + target + "'",
                      "echo '" + digest + "  " + target + "' | sha256sum -c - >/dev/null",
                      "chmod 0400 '" + target + "'"]
    return """#!/bin/bash
set -euo pipefail
umask 077
finish() {
  boot_rc=$?
  /opt/aws/bin/cfn-signal -e "$boot_rc" --stack '${AWS::StackName}' --resource RecoveryHost --region '${AWS::Region}' || true
  if [ "$boot_rc" -ne 0 ]; then /usr/sbin/shutdown -h now; fi
}
trap finish EXIT
/usr/bin/systemd-run --unit=orzell-recovery-expiry --on-active=120min /usr/sbin/shutdown -h now
test "$(wc -l < /proc/swaps)" -eq 1
ulimit -c 0
timeout 300 dnf -y install docker python3-cryptography aws-cfn-bootstrap openssl
systemctl enable --now docker
install -d -m 0700 /opt/orzell-recovery-runtime/infra/operations /opt/orzell-recovery-runtime/.github/operations /opt/orzell-recovery-runtime/docker-config
@@DOWNLOADS@@
timeout 180 /usr/bin/docker --host unix:///var/run/docker.sock --config /opt/orzell-recovery-runtime/docker-config pull '@@IMAGE@@' >/dev/null
python3 - <<'ORZELL_PUBLIC_RUNTIME'
import fcntl,importlib.util,json,os,subprocess
from pathlib import Path
import cryptography
p=Path('/opt/orzell-recovery-runtime/infra/operations/restore-protected-handoff.py')
s=importlib.util.spec_from_file_location('runtime_probe',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
m.HANDOFF.MEMORY.host_checks()
fd=os.memfd_create('orzell-public-runtime-probe',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
try:
 os.write(fd,b'public-runtime-probe');fcntl.fcntl(fd,1033,m.HANDOFF.MEMORY.SEALS)
 assert fcntl.fcntl(fd,1034)==m.HANDOFF.MEMORY.SEALS
finally:
 os.close(fd)
image=json.loads(subprocess.check_output(['/usr/bin/docker','--host','unix:///var/run/docker.sock','--config','/opt/orzell-recovery-runtime/docker-config','image','inspect','@@IMAGE@@'],timeout=20))[0]
assert '@@IMAGE@@' in image.get('RepoDigests',[])
print(json.dumps({'status':'PUBLIC_RECOVERY_RUNTIME_PREPARED_NO_INTAKE','sourceCommit':'@@SOURCE@@','cryptographyVersion':cryptography.__version__,'sealedFileProbePassed':True,'privateKeyRead':False,'productionDataRead':False,'realRecoveryReady':False}))
ORZELL_PUBLIC_RUNTIME
systemctl is-active --quiet amazon-ssm-agent
""".replace("@@DOWNLOADS@@", "\n".join(downloads)).replace("@@IMAGE@@", IMAGE).replace("@@SOURCE@@", SOURCE)


def template(base):
    value = base.template()
    value["Description"] = "Separately scoped disposable recovery runtime preparation; no key or backup intake."
    host = value["Resources"]["RecoveryHost"]["Properties"]
    host["UserData"] = {"Fn::Base64": {"Fn::Sub": bootstrap()}}
    host["Tags"] = [{"Key": "Project", "Value": "ORZELLRecoveryRehearsal"},
                    {"Key": "DataScope", "Value": "PreparationOnly"}]
    value["Outputs"]["Purpose"]["Value"] = "PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED"
    return value


def prepare(call, legacy, base):
    _, hardware = legacy.prepare(call, base.__dict__)
    try:
        cost = Decimal(hardware["estimatedTwoHourUsd"])
    except (KeyError, InvalidOperation, TypeError):
        raise ValueError("CURRENT_REGIONAL_QUOTE_REQUIRED") from None
    if not cost.is_finite() or not 0 < cost <= MAX_ESTIMATE:
        raise ValueError("NEW_SCOPE_ESTIMATE_LIMIT_EXCEEDED")
    body = json.dumps(template(base), sort_keys=True)
    return body, dict(hardware, templateSha256=hashlib.sha256(body.encode()).hexdigest(),
                      sourceCommit=SOURCE, dataScope="PreparationOnly", approvalScope="NEW_RUNTIME_PREPARATION",
                      hardBillingCap=False, realKeyIntakeEnabled=False)


def create(call, legacy, base, directory):
    # An ambiguous submission is never retried by deleting/replacing this latch.
    if os.path.lexists(directory):
        raise ValueError("LOCAL_ATTEMPT_EXISTS_USE_STATUS_NO_RETRY")
    body, plan = prepare(call, legacy, base)
    directory.mkdir(mode=0o700, parents=False, exist_ok=False)
    path = directory / "template.json"
    path.write_text(body)
    path.chmod(0o600)
    call("cloudformation", "validate-template", "--template-body", "file://" + str(path))
    legacy.check_identity(call)
    observed = legacy.observe(call)
    if observed["stackId"] or observed["activeHosts"]:
        raise ValueError("RECOVERY_APPEARED_DURING_PREFLIGHT")
    with (directory / "attempt.json").open("x") as stream:
        json.dump(dict(token=TOKEN, plan=plan, phase="CREATE_MAY_BE_SUBMITTED"), stream)
        stream.flush()
        os.fsync(stream.fileno())
    (directory / "attempt.json").chmod(0o600)
    result = call("cloudformation", "create-stack", "--stack-name", STACK,
        "--template-body", "file://" + str(path), "--parameters", "ParameterKey=AmiId,ParameterValue=" + plan["amiId"],
        "--capabilities", "CAPABILITY_IAM", "--on-failure", "DELETE", "--timeout-in-minutes", "20", "--client-request-token", TOKEN)
    if not STACK_RE.fullmatch(result.get("StackId", "")):
        raise ValueError("CREATE_RESULT_UNVERIFIED_USE_STATUS_NO_RETRY")
    with (directory / "submitted.json").open("x") as stream:
        json.dump(dict(stackId=result["StackId"], phase="SUBMITTED"), stream)
    (directory / "submitted.json").chmod(0o600)
    return dict(plan, status="RUNTIME_PREPARATION_SUBMITTED_NOT_READY", stackId=result["StackId"])


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--print-template", action="store_true")
    modes.add_argument("--preflight", action="store_true")
    modes.add_argument("--create-prepared-runtime", action="store_true")
    modes.add_argument("--status", action="store_true")
    args = parser.parse_args()
    try:
        if not any(vars(args).values()):
            result = dict(status="OFFLINE_NO_ACTION", requiresNewScopeApproval=True, realRecoveryReady=False)
        else:
            legacy, base = modules()
            if args.print_template:
                print(json.dumps(template(base), sort_keys=True))
                return 0
            if args.preflight:
                _, result = prepare(legacy.aws, legacy, base)
                result["status"] = "RUNTIME_PREFLIGHT_PASSED_NO_RESOURCES_CREATED"
            elif args.status:
                legacy.check_identity(legacy.aws)
                result = dict(legacy.observe(legacy.aws), status="RUNTIME_PREPARATION_METADATA_OBSERVED")
            else:
                result = create(legacy.aws, legacy, base, Path.home() / "orzell-protected-runtime-attempt-v1")
            result.update(privateKeyRead=False, productionDataRead=False, productionRestoreVerified=False, realRecoveryReady=False)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[A-Z0-9_]{1,140}", str(exc)) else "RUNTIME_PREPARATION_FAILED"
        print(json.dumps(dict(status="STOPPED_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY", reason=reason,
                              privateKeyRead=False, productionDataRead=False, realRecoveryReady=False)))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
