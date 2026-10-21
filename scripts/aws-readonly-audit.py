import subprocess,json,os,concurrent.futures,datetime
def aws(service,operation,region=None,**kw):
    args=["aws",service,operation,"--output","json","--no-cli-pager"]
    if region: args+=["--region",region]
    for key,value in kw.items():
        args+=["--"+key.replace("_","-"),str(value)]
    try:
        p=subprocess.run(args,capture_output=True,text=True,timeout=45)
        if p.returncode:
            err=p.stderr
            code=err.split("(")[1].split(")")[0] if "(" in err else "CommandFailed"
            return {"error":code}
        return json.loads(p.stdout) if p.stdout.strip() else {}
    except Exception as e:return {"error":type(e).__name__}
os.environ["AWS_MAX_ATTEMPTS"]="1"
out={"time":datetime.datetime.now(datetime.timezone.utc).isoformat(),"mode":"read-only"}
account=aws("sts","get-caller-identity").get("Account","")
out["accountSummary"]=aws("iam","get-account-summary")
out["passwordPolicy"]=aws("iam","get-account-password-policy")
out["auditTrust"]=aws("iam","get-role",role_name="BeautyPlatformGitHubAudit")
out["oidc"]=aws("iam","get-open-id-connect-provider",open_id_connect_provider_arn="arn:aws:iam::"+account+":oidc-provider/token.actions.githubusercontent.com")
out["s3AccountBlock"]=aws("s3control","get-public-access-block",account_id=account)
users=aws("iam","list-users")
out["users"]=users
out["userSecurity"]=[]
for u in users.get("Users",[]):
    n=u["UserName"]
    out["userSecurity"].append({"name":n,"mfa":aws("iam","list-mfa-devices",user_name=n),"keys":aws("iam","list-access-keys",user_name=n),"policies":aws("iam","list-attached-user-policies",user_name=n)})
buckets=aws("s3","list-buckets")
out["buckets"]=[]
if "error" in buckets:out["bucketError"]=buckets
for b in buckets.get("Buckets",[]):
    n=b["Name"]
    out["buckets"].append({"name":n,"location":aws("s3","get-bucket-location",bucket=n),"publicBlock":aws("s3","get-public-access-block",bucket=n),"policyStatus":aws("s3","get-bucket-policy-status",bucket=n),"encryption":aws("s3","get-bucket-encryption",bucket=n),"versioning":aws("s3","get-bucket-versioning",bucket=n),"lifecycle":aws("s3","get-bucket-lifecycle-configuration",bucket=n),"ownership":aws("s3","get-bucket-ownership-controls",bucket=n),"acl":aws("s3","get-bucket-acl",bucket=n)})
out["budgets"]=aws("budgets","describe-budgets",region="us-east-1",account_id=account)
regions=aws("ec2","describe-regions",region="eu-north-1")
out["regionsDiscovery"]=regions
def scan(r):
    d={"region":r}
    queries=[("ec2","describe-instances"),("ec2","describe-nat-gateways"),("ec2","describe-addresses"),("ec2","describe-volumes"),("rds","describe-db-instances"),("rds","describe-db-clusters"),("elasticache","describe-cache-clusters"),("elbv2","describe-load-balancers"),("lambda","list-functions"),("ecs","list-clusters"),("cloudtrail","describe-trails"),("guardduty","list-detectors"),("ec2","describe-security-groups")]
    for service,op in queries:d[service+":"+op]=aws(service,op,region=r)
    return d
names=[r["RegionName"] for r in regions.get("Regions",[])] or ["eu-north-1"]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:out["regional"]=list(pool.map(scan,names))
report_path="aws-audit-results.json"
fd=os.open(report_path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
with os.fdopen(fd,"w") as f:json.dump(out,f,indent=2)
print("\n=== AWS READ-ONLY AUDIT ===")
summary=out.get("accountSummary",{}).get("SummaryMap",{})
for k in ["AccountMFAEnabled","AccountAccessKeysPresent","Users","AccessKeysPerUserQuota"]:
    if k in summary: print(k+": "+str(summary[k]))
print("IAM users: "+str(len(out["userSecurity"])))
for u in out["userSecurity"]:
    print("User "+u["name"]+": MFA="+str(len(u["mfa"].get("MFADevices",[])))+", active keys="+str(sum(k.get("Status")=="Active" for k in u["keys"].get("AccessKeyMetadata",[]))))
print("Account S3 public block: "+json.dumps(out["s3AccountBlock"]))
for i,b in enumerate(out["buckets"],1):
    p=b["publicBlock"].get("PublicAccessBlockConfiguration",{})
    print("Bucket "+str(i)+": region="+str(b["location"].get("LocationConstraint","unknown"))+", public-block-all="+str(all(p.get(k,False) for k in ["BlockPublicAcls","IgnorePublicAcls","BlockPublicPolicy","RestrictPublicBuckets"]))+", public-policy="+str(b["policyStatus"].get("PolicyStatus",{}).get("IsPublic","unknown"))+", encryption="+str("ServerSideEncryptionConfiguration" in b["encryption"])+", versioning="+str(b["versioning"].get("Status","off")))
print("Regions checked: "+str(len(out["regional"])))
keys={"ec2:describe-instances":"Reservations","ec2:describe-nat-gateways":"NatGateways","ec2:describe-addresses":"Addresses","ec2:describe-volumes":"Volumes","rds:describe-db-instances":"DBInstances","rds:describe-db-clusters":"DBClusters","elasticache:describe-cache-clusters":"CacheClusters","elbv2:describe-load-balancers":"LoadBalancers","lambda:list-functions":"Functions","ecs:list-clusters":"clusterArns","cloudtrail:describe-trails":"trailList","guardduty:list-detectors":"DetectorIds"}
errors={}
for r in out["regional"]:
    counts={}
    for op,key in keys.items():
        v=r.get(op,{})
        if "error" in v:errors[op+":"+v["error"]]=errors.get(op+":"+v["error"],0)+1;continue
        if key=="Reservations":n=sum(len(x.get("Instances",[])) for x in v.get(key,[]))
        elif key=="NatGateways":n=sum(x.get("State") not in ["deleted","failed"] for x in v.get(key,[]))
        else:n=len(v.get(key,[]))
        if n:counts[op]=n
    if counts:print(r["region"]+": "+json.dumps(counts))
print("Regional read errors: "+json.dumps(errors))
print("Budget read: "+str(out["budgets"].get("error","OK")))
for b in out["budgets"].get("Budgets",[]):
    print("Budget: "+json.dumps({k:b.get(k) for k in ["BudgetName","BudgetType","BudgetLimit","CalculatedSpend"]}))
print("No Cost Explorer queries made; actual billed charges not verified.")
print("No AWS settings changed; no resources created or deleted.")
print("Full report saved only in CloudShell: "+report_path)
