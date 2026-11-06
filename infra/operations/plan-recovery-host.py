#!/usr/bin/env python3
"""Prepare a same-account synthetic recovery host plan; never provisions it."""

import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re
import subprocess


ACCOUNT = "926642724499"
REGION = "eu-north-1"
STACK = "orzell-recovery-rehearsal-v1"
IMAGE_FILTERS = [{"Name": "name", "Values": ["al2023-ami-2023.*-kernel-*-x86_64"]},
                 {"Name": "state", "Values": ["available"]}, {"Name": "architecture", "Values": ["x86_64"]},
                 {"Name": "root-device-type", "Values": ["ebs"]}, {"Name": "is-public", "Values": ["true"]}]
INSTANCE = "t3.medium"
DISK_GB = 20
HOURS = 2
IPV4_HOURLY = Decimal("0.005")
REVIEW_BUDGET = Decimal("1.00")
READS = {("sts", "get-caller-identity"), ("ec2", "describe-images"), ("pricing", "get-products")}
SESSION_ACTIONS = ["ssm:UpdateInstanceInformation", "ssmmessages:CreateControlChannel",
                   "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"]
PROBE_URL = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/3bf45d331d16ba633d41f5e06ef959d6e421587d/infra/operations/phone-recovery-rehearsal.py"
PROBE_SHA = "ae8fcc8b9a8c8559d1ddd9ae56d9ca4d2f9e47b9fc45eb58e2eab6bcc244bde4"


def bootstrap():
    # No private key or production package is accepted by this bootstrap.
    return """#!/bin/bash
set -euo pipefail
umask 077
finish() {
  boot_rc=$?
  /opt/aws/bin/cfn-signal -e "$boot_rc" --stack '${AWS::StackName}' --resource RecoveryHost --region '${AWS::Region}' || true
  if [ "$boot_rc" -ne 0 ]; then /usr/sbin/shutdown -h now; fi
}
trap finish EXIT
# First operation: monotonic, best-effort expiry; the CFN signal timeout is separate.
/usr/bin/systemd-run --unit=orzell-recovery-expiry --on-active=120min /usr/sbin/shutdown -h now
test "$(wc -l < /proc/swaps)" -eq 1
ulimit -c 0
timeout 300 dnf -y install docker aws-cfn-bootstrap
systemctl enable --now docker
install -d -m 0700 /opt/orzell-recovery
curl --connect-timeout 15 --max-time 60 -fsSL 'PROBE_URL' -o /opt/orzell-recovery/synthetic-probe.py
echo 'PROBE_SHA  /opt/orzell-recovery/synthetic-probe.py' | sha256sum -c -
# No swap bypass. The probe uses fixed synthetic data in an isolated tmpfs container.
timeout 600 python3 -u /opt/orzell-recovery/synthetic-probe.py --allow-public-image-pull > /opt/orzell-recovery/synthetic-result.log 2>&1
systemctl is-active --quiet amazon-ssm-agent
""".replace("PROBE_URL", PROBE_URL).replace("PROBE_SHA", PROBE_SHA)


def template():
    resources = {
        "Network": {"Type": "AWS::EC2::VPC", "Properties": {"CidrBlock": "10.249.240.0/24", "EnableDnsSupport": True,
            "EnableDnsHostnames": True, "Tags": [{"Key": "Project", "Value": "ORZELLRecoveryRehearsal"}]}},
        "Internet": {"Type": "AWS::EC2::InternetGateway"},
        "AttachInternet": {"Type": "AWS::EC2::VPCGatewayAttachment", "Properties": {
            "VpcId": {"Ref": "Network"}, "InternetGatewayId": {"Ref": "Internet"}}},
        "Subnet": {"Type": "AWS::EC2::Subnet", "Properties": {"VpcId": {"Ref": "Network"},
            "CidrBlock": "10.249.240.0/25", "MapPublicIpOnLaunch": False}},
        "Routes": {"Type": "AWS::EC2::RouteTable", "Properties": {"VpcId": {"Ref": "Network"}}},
        "PublicRoute": {"Type": "AWS::EC2::Route", "DependsOn": "AttachInternet", "Properties": {
            "RouteTableId": {"Ref": "Routes"}, "DestinationCidrBlock": "0.0.0.0/0", "GatewayId": {"Ref": "Internet"}}},
        "SubnetRoutes": {"Type": "AWS::EC2::SubnetRouteTableAssociation", "Properties": {
            "SubnetId": {"Ref": "Subnet"}, "RouteTableId": {"Ref": "Routes"}}},
        "Firewall": {"Type": "AWS::EC2::SecurityGroup", "Properties": {"VpcId": {"Ref": "Network"},
            "GroupDescription": "No ingress; outbound HTTPS for SSM and public package/image preparation only",
            "SecurityGroupIngress": [], "SecurityGroupEgress": [{"IpProtocol": "tcp", "FromPort": 443, "ToPort": 443,
                "CidrIp": "0.0.0.0/0"}]}},
        "SessionRole": {"Type": "AWS::IAM::Role", "Properties": {
            "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [{"Effect": "Allow",
                "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]},
            "Policies": [{"PolicyName": "RecoverySessionAndOwnReadinessOnly", "PolicyDocument": {"Version": "2012-10-17", "Statement": [
                {"Effect": "Allow", "Action": list(SESSION_ACTIONS), "Resource": "*"},
                {"Effect": "Allow", "Action": "cloudformation:SignalResource", "Resource": {"Ref": "AWS::StackId"}},
                {"Effect": "Deny", "Action": ["s3:*", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath",
                    "secretsmanager:GetSecretValue", "kms:Decrypt"], "Resource": "*"}]} }]}},
        "SessionProfile": {"Type": "AWS::IAM::InstanceProfile", "Properties": {"Roles": [{"Ref": "SessionRole"}]}},
        "RecoveryHost": {"Type": "AWS::EC2::Instance", "DependsOn": ["PublicRoute", "SubnetRoutes"],
            "CreationPolicy": {"ResourceSignal": {"Count": 1, "Timeout": "PT15M"}}, "Properties": {
                "ImageId": {"Ref": "AmiId"}, "InstanceType": INSTANCE, "CreditSpecification": {"CPUCredits": "standard"},
                "IamInstanceProfile": {"Ref": "SessionProfile"}, "InstanceInitiatedShutdownBehavior": "terminate",
                "MetadataOptions": {"HttpEndpoint": "enabled", "HttpTokens": "required", "HttpPutResponseHopLimit": 1},
                "NetworkInterfaces": [{"DeviceIndex": "0", "AssociatePublicIpAddress": True, "DeleteOnTermination": True,
                    "SubnetId": {"Ref": "Subnet"}, "GroupSet": [{"Ref": "Firewall"}]}],
                "BlockDeviceMappings": [{"DeviceName": "/dev/xvda", "Ebs": {"Encrypted": True, "DeleteOnTermination": True,
                    "VolumeSize": DISK_GB, "VolumeType": "gp3"}}],
                "UserData": {"Fn::Base64": {"Fn::Sub": bootstrap()}},
                "Tags": [{"Key": "Project", "Value": "ORZELLRecoveryRehearsal"}, {"Key": "DataScope", "Value": "SyntheticOnly"}]}}
    }
    return {"AWSTemplateFormatVersion": "2010-09-09", "Description": "Paid same-account synthetic recovery host candidate; no real-key handoff installed.",
        "Parameters": {"AmiId": {"Type": "AWS::EC2::Image::Id", "Description": "Exact Amazon AL2023 x86_64 AMI ID from the reviewed cost plan; no mutable default"}},
        "Rules": {"FixedAccountAndRegion": {"Assertions": [
            {"Assert": {"Fn::Equals": [{"Ref": "AWS::AccountId"}, ACCOUNT]}, "AssertDescription": "Reviewed account only"},
            {"Assert": {"Fn::Equals": [{"Ref": "AWS::Region"}, REGION]}, "AssertDescription": "Reviewed Stockholm region only"}]}},
        "Resources": resources, "Outputs": {"InstanceId": {"Value": {"Ref": "RecoveryHost"}},
            "Purpose": {"Value": "SYNTHETIC_ONLY_REAL_RECOVERY_NOT_READY"}}}


def aws(service, operation, *args):
    if (service, operation) not in READS:
        raise ValueError("READ_ONLY_HOST_PLAN_REQUIRED")
    region = "us-east-1" if service == "pricing" else REGION
    result = subprocess.run(["aws", service, operation, *args, "--region", region, "--output", "json", "--no-cli-pager",
        "--cli-connect-timeout", "5", "--cli-read-timeout", "20"], capture_output=True, text=True, timeout=35)
    if result.returncode:
        match = re.search(r"\(([A-Za-z]+)\)", result.stderr)
        code = match[1] if match and match[1] in {"AccessDenied", "AccessDeniedException", "UnauthorizedOperation",
            "ExpiredToken", "ThrottlingException", "RequestLimitExceeded", "ValidationError"} else "Unavailable"
        raise ValueError("HOST_PLAN_READ_UNAVAILABLE_" + service.upper() + "_" + operation.upper().replace("-", "_") + "_" + code.upper())
    return json.loads(result.stdout)


def rate(call, attributes, unit):
    filters = [{"Type": "TERM_MATCH", "Field": key, "Value": value} for key, value in attributes.items()]
    page = call("pricing", "get-products", "--service-code", "AmazonEC2", "--filters", json.dumps(filters), "--max-results", "100")
    if page.get("NextToken") or len(page.get("PriceList", [])) != 1:
        raise ValueError("UNAMBIGUOUS_REGIONAL_PRICE_REQUIRED")
    product = json.loads(page["PriceList"][0])
    actual = product.get("product", {}).get("attributes", {})
    if any(actual.get(key) != value for key, value in attributes.items() if key != "productFamily"):
        raise ValueError("REGIONAL_PRODUCT_BINDING_DIFFERS")
    if "productFamily" in attributes and product.get("product", {}).get("productFamily") != attributes["productFamily"]:
        raise ValueError("PRODUCT_FAMILY_DIFFERS")
    terms = list(product.get("terms", {}).get("OnDemand", {}).values())
    if len(terms) != 1:
        raise ValueError("ONE_ON_DEMAND_TERM_REQUIRED")
    dimensions = list(terms[0].get("priceDimensions", {}).values())
    if (len(dimensions) != 1 or dimensions[0].get("unit") != unit or dimensions[0].get("beginRange") != "0"
            or dimensions[0].get("endRange") != "Inf" or dimensions[0].get("appliesTo", [])):
        raise ValueError("UNBOUNDED_BASE_RATE_REQUIRED")
    try:
        value = Decimal(dimensions[0]["pricePerUnit"]["USD"])
    except (KeyError, InvalidOperation):
        raise ValueError("USD_PRICE_REQUIRED") from None
    if not value.is_finite() or value <= 0:
        raise ValueError("POSITIVE_FINITE_PRICE_REQUIRED")
    return value


def inspect(call=aws):
    if call("sts", "get-caller-identity").get("Account") != ACCOUNT:
        raise ValueError("WRONG_ACCOUNT")
    # Public EC2 image inventory needs no Parameter Store value-read permission.
    page = call("ec2", "describe-images", "--owners", "amazon", "--filters", json.dumps(IMAGE_FILTERS))
    images = page.get("Images", [])
    if page.get("NextToken") or not images:
        raise ValueError("COMPLETE_PUBLIC_IMAGE_LIST_REQUIRED")
    dated = []
    for image in images:
        if (not re.fullmatch(r"ami-[0-9a-f]{8,17}", image.get("ImageId", "")) or image.get("ImageOwnerAlias") != "amazon"
                or not re.fullmatch(r"al2023-ami-2023\.\d+\.\d{8}\.\d+-kernel-\d+(?:\.\d+){1,3}-x86_64", image.get("Name", ""))
                or image.get("State") != "available" or image.get("Architecture") != "x86_64"
                or image.get("RootDeviceType") != "ebs" or image.get("RootDeviceName") != "/dev/xvda"
                or image.get("Public") is not True or image.get("ProductCodes")):
            raise ValueError("AMAZON_LINUX_IMAGE_BINDING_REQUIRED")
        created = datetime.fromisoformat(image.get("CreationDate", "").replace("Z", "+00:00"))
        if created.tzinfo is None or created > datetime.now(timezone.utc):
            raise ValueError("PUBLIC_IMAGE_DATE_UNVERIFIED")
        kernel = tuple(int(part) for part in re.search(r"-kernel-([0-9.]+)-x86_64$", image["Name"])[1].split("."))
        dated.append((created, kernel, image["ImageId"]))
    latest = max(value[0] for value in dated)
    newest_kernel = max(kernel for created, kernel, _ in dated if created == latest)
    selected = {ami for created, kernel, ami in dated if created == latest and kernel == newest_kernel}
    if len(selected) != 1:
        raise ValueError("AMBIGUOUS_LATEST_PUBLIC_IMAGE")
    ami = selected.pop()
    compute = rate(call, {"regionCode": REGION, "instanceType": INSTANCE, "operatingSystem": "Linux", "tenancy": "Shared",
        "preInstalledSw": "NA", "capacitystatus": "Used", "operation": "RunInstances", "licenseModel": "No License required"}, "Hrs")
    storage = rate(call, {"regionCode": REGION, "productFamily": "Storage", "volumeApiName": "gp3"}, "GB-Mo")
    hourly = compute + storage * DISK_GB / Decimal(720) + IPV4_HOURLY
    cost = hourly * HOURS
    return {"status": "SAME_ACCOUNT_SYNTHETIC_HOST_PLAN_PRICED", "checkedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "region": REGION, "instanceType": INSTANCE, "amiId": ami, "amiSelectionRule": "LATEST_PUBLIC_RELEASE_THEN_NEWEST_KERNEL",
        "rootDiskGiB": DISK_GB, "plannedHours": HOURS,
        "computeUsdPerHour": str(compute), "gp3UsdPerGbMonth": str(storage), "publicIpv4UsdPerHour": str(IPV4_HOURLY),
        "estimatedUsdPerHour": str(hourly.quantize(Decimal("0.000001"))), "estimatedTwoHourUsd": str(cost.quantize(Decimal("0.000001"))),
        "withinOneDollarPlanningBudget": cost <= REVIEW_BUDGET, "excludesTaxAndDataTransfer": True,
        "terminationVerified": False, "hardBillingCap": False, "accountLossRecoveryVerified": False,
        "realRecoveryReady": False, "provisioned": False, "privateKeyRead": False, "productionDataRead": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--print-template", action="store_true")
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    if args.print_template and args.inspect:
        parser.error("select one mode")
    try:
        if args.print_template:
            print(json.dumps(template(), indent=2))
        elif args.inspect:
            print(json.dumps(inspect(), sort_keys=True))
        else:
            body = json.dumps(template(), sort_keys=True).encode()
            print(json.dumps({"status": "PLAN_ONLY_NO_NETWORK", "stack": STACK, "templateSha256": hashlib.sha256(body).hexdigest(),
                "paidResourceCandidate": True, "newRoleCandidate": True, "plannedHours": HOURS,
                "provisioned": False, "realRecoveryReady": False, "accountLossRecoveryVerified": False}))
    except Exception as error:
        reason = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Z_]{1,120}", str(error)) else type(error).__name__
        print(json.dumps({"status": "HOST_PLAN_NOT_VERIFIED", "reason": reason, "provisioned": False, "realRecoveryReady": False}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
