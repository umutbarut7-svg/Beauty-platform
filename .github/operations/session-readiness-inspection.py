import json,sys,subprocess
if sys.argv[1:] != ["--inspect"]:
    print(json.dumps({"status":"OFFLINE_NO_ACTION"}))
    raise SystemExit(0 if len(sys.argv)==1 else 2)
try:
    r=subprocess.run(["aws","sts","get-caller-identity","--region","eu-north-1","--output","json","--no-cli-pager","--cli-connect-timeout","5","--cli-read-timeout","20"],capture_output=True,text=True,timeout=35)
    if r.returncode or len(r.stdout)>8192 or json.loads(r.stdout).get("Account")!="926642724499": raise ValueError()
except Exception:
    print(json.dumps({"status":"OWNER_ACCOUNT_NOT_VERIFIED"}))
    raise SystemExit(1)
import json,subprocess,shlex
from pathlib import Path
def state(v):
    if v is None: return "NOT_SET"
    if isinstance(v,str) and "{{" in v: return "PARAMETERIZED"
    if isinstance(v,dict): return "CONFIGURED" if any(v.values()) else "EMPTY"
    if isinstance(v,bool): return str(v).upper()
    if isinstance(v,str) and v.lower() in ("true","false"): return v.upper()
    return "EMPTY" if v=="" else "CONFIGURED"
for name in ("AWS-StartInteractiveCommand","SSM-SessionManagerRunShell"):
    try:
        r=subprocess.run(["aws","ssm","get-document","--region","eu-north-1","--name",name,"--document-format","JSON","--no-cli-pager","--output","json","--cli-connect-timeout","5","--cli-read-timeout","20"],capture_output=True,text=True,timeout=35)
        if r.returncode or len(r.stdout)>250000: raise ValueError()
        d=json.loads(r.stdout); c=json.loads(d["Content"]); i=c.get("inputs",{})
        keys=("s3BucketName","cloudWatchLogGroupName","cloudWatchStreamingEnabled","kmsKeyId","shellProfile")
        print(json.dumps({"document":name,"version":d.get("DocumentVersion"),"sessionType":c.get("sessionType"),"settings":{k:state(i.get(k)) for k in keys}}),flush=True)
    except Exception:
        print(json.dumps({"document":name,"status":"READ_UNAVAILABLE"}),flush=True)
runtime="import importlib.util,json,resource,ssl,subprocess; print(json.dumps({'cryptographyAvailable':importlib.util.find_spec('cryptography') is not None,'opensslVersion':ssl.OPENSSL_VERSION,'coreSoftLimit':resource.getrlimit(resource.RLIMIT_CORE)[0],'hostSwapActive':len(open('/proc/swaps').read().splitlines())>1,'runFilesystem':subprocess.check_output(['findmnt','-n','-o','FSTYPE','-T','/run'],text=True).strip()}))"
p=Path.home()/"orzell-runtime-okuma.json"
p.write_text(json.dumps({"command":["sudo python3 -c "+shlex.quote(runtime)]}))
p.chmod(0o600)
