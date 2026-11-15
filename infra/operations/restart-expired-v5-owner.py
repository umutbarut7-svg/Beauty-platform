#!/usr/bin/env python3
"""Retire only the first expired v5 owner session, then open one fresh intake."""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import urllib.request

ACCOUNT = "926642724499"
REGION = "eu-north-1"
TARGET = "i-03b5ef4090b555b92"
STACK = "arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/69c72bc0-e0e1-11f1-be30-06ffd3bddf55"
START_MIN = datetime.fromisoformat("2026-11-15T10:53:00+00:00")
START_MAX = datetime.fromisoformat("2026-11-15T10:54:00+00:00")
EXPIRED_AT = datetime.fromisoformat("2026-11-15T11:03:17+00:00")
URL = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/a25220c6bb19e0158ec15b78d8bfdef247510bb9/infra/operations/start-owner-piped-recovery-v5.py"
SHA = "71903fb2ebe4a62bf1c96def9e52c98bb8a05b81bd47d183dea5ba82e8641c56"

def active(ssm):
    page = ssm.describe_sessions(State="Active", Filters=[{"key":"Target","value":TARGET}], MaxResults=50)
    if page.get("NextToken"):
        raise ValueError("COMPLETE_SESSION_LIST_REQUIRED")
    return page.get("Sessions", [])

def retire(ssm, now):
    if now < EXPIRED_AT:
        raise ValueError("OLD_INTAKE_NOT_EXPIRED")
    values = active(ssm)
    if not values:
        return
    if len(values) != 1:
        raise ValueError("UNIQUE_EXPIRED_OWNER_SESSION_REQUIRED")
    old = values[0]
    started = old.get("StartDate")
    identifier = old.get("SessionId")
    if (old.get("Target") != TARGET or not isinstance(started,datetime) or started.tzinfo is None
            or not START_MIN <= started <= START_MAX
            or not isinstance(identifier,str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}",identifier)):
        raise ValueError("EXPIRED_OWNER_BINDING_DIFFERS")
    if old.get("Status") != "Terminating":
        ssm.terminate_session(SessionId=identifier)
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        remaining = active(ssm)
        if not remaining:
            return
        if len(remaining) != 1 or remaining[0].get("SessionId") != identifier:
            raise ValueError("DIFFERENT_SESSION_APPEARED_NO_NEW_INTAKE")
        time.sleep(1)
    raise ValueError("OLD_SESSION_STILL_ACTIVE_NO_NEW_INTAKE")

def main():
    os.umask(0o077)
    if sys.argv[1:] != ["--restart-expired-owner"]:
        print(json.dumps({"status":"OFFLINE_NO_ACTION","privateKeyRead":False}))
        return 0 if not sys.argv[1:] else 2
    try:
        with urllib.request.urlopen(URL,timeout=30) as response:
            source = response.read(16385)
        if len(source)>16384 or hashlib.sha256(source).hexdigest()!=SHA:
            raise ValueError("PINNED_V5_OWNER_REQUIRED")
        with tempfile.TemporaryDirectory(prefix="orzell-v5-restart-public-") as directory:
            path = Path(directory)/"owner.py"
            path.write_bytes(source)
            path.chmod(0o400)
            spec=importlib.util.spec_from_file_location("restart_v5_owner",path)
            owner=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(owner)
            if owner.STACK != STACK or owner.INSTANCE != TARGET:
                raise ValueError("EXACT_V5_OWNER_REQUIRED")
            import boto3
            from botocore.config import Config
            session=boto3.Session(region_name=REGION)
            if session.client("sts").get_caller_identity()["Account"]!=ACCOUNT:
                raise ValueError("REVIEWED_ACCOUNT_REQUIRED")
            ssm=session.client("ssm",config=Config(connect_timeout=5,read_timeout=10,retries={"total_max_attempts":1}))
            retire(ssm,datetime.now(timezone.utc))
            if active(ssm):
                raise ValueError("ACTIVE_SESSION_BLOCKS_NEW_INTAKE")
            print("ESKI_OTURUM_KAPALI_YENISI_ACILIYOR",flush=True)
            arguments=sys.argv[:]
            try:
                sys.argv=[str(path),"--start-approved-isolated-restore"]
                return owner.main()
            finally:
                sys.argv=arguments
    except Exception as error:
        reason=str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z0-9_]{1,140}",str(error)) else "V5_RESTART_UNVERIFIED"
        print(json.dumps({"status":"STOPPED_NO_AUTOMATIC_RETRY","reason":reason,"realRecoveryReady":False}))
        return 1

if __name__=="__main__":
    raise SystemExit(main())
