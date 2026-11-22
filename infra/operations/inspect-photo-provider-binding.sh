#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import json,subprocess
source="\"use strict\";\nconst {createRequire}=require(\"node:module\");\nconst bootstrapRequire=createRequire(\"/bootstrap/entrypoint.cjs\");\nconst {SSMClient,GetParametersCommand}=bootstrapRequire(\"@aws-sdk/client-ssm\");\nconst {PrivatePhotoStore}=require(\"./dist/mvp/providers/private-photo-store.js\");\nasync function main(){\n  if(process.env.AWS_REGION!==\"eu-north-1\"||process.env.MVP_S3_ENABLED!==\"true\") throw new Error(\"CONFIG\");\n  if(process.env.MVP_AI_ENABLED!==\"false\"||process.env.MVP_PHOTO_POLICY_REVIEWED!==\"false\") throw new Error(\"GATE\");\n  if(process.env.MVP_PHOTO_RETENTION_HOURS!==\"24\"||process.env.MVP_PHOTO_AUDIT_RETENTION_DAYS!==\"90\"||!process.env.MVP_PHOTO_NOTICE||!process.env.MVP_PHOTO_POLICY_VERSION) throw new Error(\"NOTICE\");\n  console.log(\"STAGED_NOTICE_AND_RETENTION: PASS\");\n  const storage=new PrivatePhotoStore();\n  try{await storage.assertPrivateBucket();console.log(\"RUNTIME_PRIVATE_BUCKET_SECURITY: PASS\");}\n  finally{storage.onModuleDestroy();}\n  const client=new SSMClient({region:\"eu-north-1\",maxAttempts:1,requestHandler:{connectionTimeout:3000,requestTimeout:10000}});\n  let reply;\n  try{reply=await client.send(new GetParametersCommand({Names:[\"/beauty-platform/dev/openai-api-key\"],WithDecryption:true}));}\n  finally{client.destroy();}\n  const parameter=reply.Parameters?.find(p=>p.Name===\"/beauty-platform/dev/openai-api-key\");\n  if(reply.InvalidParameters?.length||parameter?.Type!==\"SecureString\"||!parameter.Value?.trim()||/[\\r\\n]/.test(parameter.Value)) throw new Error(\"BINDING\");\n  console.log(\"EXISTING_KEY_RUNTIME_BINDING: PASS\");\n  const response=await fetch(\"https://api.openai.com/v1/models\",{headers:{Authorization:\"Bearer \"+parameter.Value},signal:AbortSignal.timeout(12000)});\n  if(response.status!==200) throw new Error(\"MODELS_HTTP_\"+response.status);\n  const body=await response.json();\n  if(!Array.isArray(body.data)||!body.data.some(m=>m.id===process.env.OPENAI_VISION_MODEL)) throw new Error(\"MODEL\");\n  console.log(\"OPENAI_AUTH_AND_CONFIGURED_MODEL_LISTED: PASS\");\n  console.log(\"READ_ONLY_PROVIDER_PREFLIGHT: PASS\");\n}\nmain().catch(()=>{console.log(\"RUNTIME_PROVIDER_PREFLIGHT_FAILED; raw errors suppressed\");process.exitCode=1;});\n"
names=['STAGED_NOTICE_AND_RETENTION: PASS','RUNTIME_PRIVATE_BUCKET_SECURITY: PASS','EXISTING_KEY_RUNTIME_BINDING: PASS','OPENAI_AUTH_AND_CONFIGURED_MODEL_LISTED: PASS','READ_ONLY_PROVIDER_PREFLIGHT: PASS','RUNTIME_PROVIDER_PREFLIGHT_FAILED; raw errors suppressed']
before={}
for service in ['api','worker']:
    result=subprocess.run(['docker','inspect','beauty-preview-'+service+'-1','--format','{{.Id}}'],capture_output=True,text=True,timeout=15)
    if result.returncode:raise SystemExit('Required runtime unavailable')
    before[service]=result.stdout.strip()
failed=False
for service in ['api','worker']:
    try:
        result=subprocess.run(['docker','exec','-i','beauty-preview-'+service+'-1','node','--max-old-space-size=96','-'],input=source,capture_output=True,text=True,timeout=65)
    except subprocess.TimeoutExpired:
        print(service+' probe timeout; no raw output',flush=True)
        failed=True
        continue
    lines=result.stdout.splitlines()
    for line in lines:
        if line in names:print(service+' '+line,flush=True)
    if result.returncode or any(label not in lines for label in names[:5]):failed=True
for service,identity in before.items():
    result=subprocess.run(['docker','inspect','beauty-preview-'+service+'-1','--format','{{.Id}}'],capture_output=True,text=True,timeout=15)
    if result.returncode or result.stdout.strip()!=identity:raise SystemExit('Concurrent runtime change detected')
print('No photo, paid model call, database change, service restart or persistent key export.',flush=True)
if failed:raise SystemExit('Runtime provider readiness did not pass; photo/AI gates remain closed')
PY
