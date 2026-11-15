#!/usr/bin/env python3
"""Verify the observed v5 restore receipt and remove only its approved stack."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import urllib.request

ACCOUNT="926642724499"
REGION="eu-north-1"
STACK="arn:aws:cloudformation:eu-north-1:926642724499:stack/orzell-protected-runtime-v1/69c72bc0-e0e1-11f1-be30-06ffd3bddf55"
INSTANCE="i-03b5ef4090b555b92"
RECEIPT="70b11a65ec2b01dbe812e98fd15aaf2c"
APPLICATION="2e56def282c97a804a2f3d6c9b36a53b42a09df5"
HELPER_URL="https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/ee647c1f66aeff86a2eb80294b47c882eeba7178/infra/operations/recovery-result-receipt.py"
HELPER_SHA="842a6116f3d71ca65a3234431de67711aa5c9c24505cb9d401ee6308f398ca3f"
RESOURCES={"Network":"AWS::EC2::VPC","Internet":"AWS::EC2::InternetGateway",
 "AttachInternet":"AWS::EC2::VPCGatewayAttachment","Subnet":"AWS::EC2::Subnet",
 "Routes":"AWS::EC2::RouteTable","PublicRoute":"AWS::EC2::Route",
 "SubnetRoutes":"AWS::EC2::SubnetRouteTableAssociation","Firewall":"AWS::EC2::SecurityGroup",
 "SessionRole":"AWS::IAM::Role","SessionProfile":"AWS::IAM::InstanceProfile",
 "RecoveryHost":"AWS::EC2::Instance"}

def verify_receipt(value):
    binding=value.get("binding",{})
    expected={"account":ACCOUNT,"region":REGION,"stackId":STACK,"instanceId":INSTANCE,
              "backupId":"orzell-database-20261112","applicationSha":APPLICATION,
              "runnerSource":"f187f56a080c12370b5986a2ce337e40ca4fab3d",
              "runnerSha256":"36c921f3eb0f31bfaadb479e63c20f4904d9034fa59234da58cea7ede0644c3a",
              "packageSha256":"0125b3789379511b52c8a61dbb24f2b847d34626f2a51562fe2a0bc2fa2d1221"}
    report=value.get("result",{})
    if (value.get("receiptId")!=RECEIPT or binding!=expected
        or value.get("observation")!="OWNER_TERMINAL_RESULT_OBSERVED"
        or value.get("sessionExitCode")!=0 or not value.get("sessionEndedAt")
        or value.get("independentAttestation") is not False
        or value.get("productionReopenAuthorized") is not False
        or report.get("status")!="OWNER_SNAPSHOT_RESTORED_TO_ISOLATED_DATABASE"
        or report.get("actualBackupRestoredToIsolatedDatabase") is not True):
        raise ValueError("EXACT_SUCCESS_RECEIPT_REQUIRED")
    return value

def read_receipt():
    with urllib.request.urlopen(HELPER_URL,timeout=30) as response:
        source=response.read(32769)
    if len(source)>32768 or hashlib.sha256(source).hexdigest()!=HELPER_SHA:
        raise ValueError("PINNED_RECEIPT_READER_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="orzell-public-receipt-reader-") as directory:
        path=Path(directory)/"reader.py";path.write_bytes(source);path.chmod(0o400)
        spec=importlib.util.spec_from_file_location("finish_v5_reader",path)
        helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
        return verify_receipt(helper.show_last_result(Path.home()/"orzell-recovery-results"))

def resources(cfn):
    values=[]
    for page in cfn.get_paginator("list_stack_resources").paginate(StackName=STACK):
        values.extend(page.get("StackResourceSummaries",[]))
        if len(values)>len(RESOURCES):
            raise ValueError("STACK_RESOURCE_SCOPE_DIFFERS")
    if {v["LogicalResourceId"]:v["ResourceType"] for v in values}!=RESOURCES or len(values)!=len(RESOURCES):
        raise ValueError("STACK_RESOURCE_SCOPE_DIFFERS")
    return values

def cleanup(session):
    if session.client("sts").get_caller_identity().get("Account")!=ACCOUNT:
        raise ValueError("REVIEWED_ACCOUNT_REQUIRED")
    cfn=session.client("cloudformation")
    stack=cfn.describe_stacks(StackName=STACK)["Stacks"][0]
    if stack.get("StackId")!=STACK:
        raise ValueError("EXACT_STACK_REQUIRED")
    state=stack.get("StackStatus")
    before=resources(cfn)
    if state in {"CREATE_COMPLETE","DELETE_FAILED"}:
        outputs={v["OutputKey"]:v["OutputValue"] for v in stack.get("Outputs",[])}
        if outputs.get("InstanceId")!=INSTANCE or outputs.get("Purpose")!="PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED":
            raise ValueError("EXACT_V5_RUNTIME_REQUIRED")
        page=session.client("ssm").describe_sessions(State="Active",Filters=[{"key":"Target","value":INSTANCE}],MaxResults=50)
        if page.get("Sessions") or page.get("NextToken"):
            raise ValueError("ACTIVE_SESSION_BLOCKS_CLEANUP")
        cfn.delete_stack(StackName=STACK,ClientRequestToken="orzell-v5-cleanup-69c72bc0-20261115")
        print("GECICI_ORTAM_TEMIZLENIYOR",flush=True)
    elif state not in {"DELETE_IN_PROGRESS","DELETE_COMPLETE"}:
        raise ValueError("STACK_STATE_REQUIRES_REVIEW")
    cfn.get_waiter("stack_delete_complete").wait(StackName=STACK,WaiterConfig={"Delay":5,"MaxAttempts":120})
    state=cfn.describe_stacks(StackName=STACK)["Stacks"][0].get("StackStatus")
    leftovers=[{"resource":v["LogicalResourceId"],"status":v["ResourceStatus"]}
               for v in resources(cfn) if v.get("ResourceStatus")!="DELETE_COMPLETE"]
    if state!="DELETE_COMPLETE" or leftovers:
        raise ValueError("V5_CLEANUP_NOT_VERIFIED")
    return {"status":"V5_SCOPED_CLEANUP_VERIFIED","stackStatus":state,"remainingStackResources":leftovers,
            "productionReopenAuthorized":False}

def main():
    os.umask(0o077)
    if sys.argv[1:]!=["--verify-result-and-cleanup"]:
        print(json.dumps({"status":"OFFLINE_NO_ACTION"}));return 0 if len(sys.argv)==1 else 2
    try:
        observed=read_receipt()
        print(json.dumps(observed,sort_keys=True),flush=True)
        import boto3
        from botocore.config import Config
        session=boto3.Session(region_name=REGION)
        # All delete calls remain single-attempt even after an ambiguous network error.
        original=session.client
        def client(name):
            return original(name,config=Config(connect_timeout=5,read_timeout=20,retries={"total_max_attempts":1}))
        session.client=client
        print(json.dumps(cleanup(session),sort_keys=True),flush=True)
        return 0
    except Exception as error:
        reason=str(error) if isinstance(error,ValueError) and re.fullmatch(r"[A-Z0-9_]{1,140}",str(error)) else "RESULT_OR_CLEANUP_UNVERIFIED_USE_STATUS"
        print(json.dumps({"status":"STOPPED_NO_AUTOMATIC_RETRY","reason":reason,"productionReopenAuthorized":False}))
        return 1
if __name__=="__main__":
    raise SystemExit(main())
