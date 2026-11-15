#!/usr/bin/env python3
"""One v5 preparation attempt; no key intake or restore."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

OPERATOR_SHA = "a3a766633a2bc9b30e41560ebecaef6d7ad0ae2190c8215392e7327eacba7111"
TEMPLATE_SHA = "b67152a40e0f41e11b0328fd0cff7956416b5f3e0b01befcd7016a2c38c0acc9"
AMI = "ami-0f71b90bee7050a75"
TOKEN = "orzell-protected-runtime-20261115-v5"
ATTEMPT = "orzell-protected-runtime-attempt-20261115-v5"

def bind(operator):
    original = operator.prepare
    def exact_plan(call, legacy, base):
        body, plan = original(call, legacy, base)
        if plan.get("templateSha256") != TEMPLATE_SHA or plan.get("amiId") != AMI:
            raise ValueError("REVIEWED_V5_PLAN_CHANGED_NO_CREATE")
        return body, plan
    operator.prepare = exact_plan
    operator.TOKEN = TOKEN
    return operator

def load(directory):
    path = directory / "prepare-protected-recovery-host.py"
    if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != OPERATOR_SHA:
        raise ValueError("PINNED_V5_OPERATOR_REQUIRED")
    spec = importlib.util.spec_from_file_location("v5_preparation", path)
    operator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(operator)
    return bind(operator)

def main():
    os.umask(0o077)
    if len(sys.argv) == 1:
        print(json.dumps({"status":"OFFLINE_NO_ACTION","realRecoveryReady":False}))
        return 0
    if len(sys.argv) != 3 or sys.argv[1] != "--create-approved-v5-runtime":
        print(json.dumps({"status":"UNSUPPORTED_V5_ARGUMENTS"}))
        return 2
    try:
        operator = load(Path(sys.argv[2]))
        legacy, base = operator.modules()
        result = operator.create(legacy.aws, legacy, base, Path.home()/ATTEMPT)
        result.update(privateKeyRead=False, productionDataRead=False,
                      realKeyIntakeEnabled=False, realRecoveryReady=False)
        print(json.dumps(result, sort_keys=True))
        return 0
    except Exception as error:
        reason = str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z0-9_]{1,140}",str(error)) else "V5_PREPARATION_UNVERIFIED_NO_RETRY"
        print(json.dumps({"status":"STOPPED_REVIEW_REQUIRED_NO_AUTOMATIC_RETRY","reason":reason,
                          "realRecoveryReady":False}))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
