#!/bin/bash
set -euo pipefail
python3 - <<'PY'
import subprocess
source="\"use strict\";\nconst assert=require(\"node:assert/strict\");\nconst {randomUUID}=require(\"node:crypto\");\nconst sharp=require(\"sharp\");\nconst {S3Client,HeadObjectCommand}=require(\"@aws-sdk/client-s3\");\nconst {PrivatePhotoStore}=require(\"./dist/mvp/providers/private-photo-store.js\");\nconst store=new PrivatePhotoStore();\nconst client=new S3Client({region:\"eu-north-1\",maxAttempts:1,requestHandler:{connectionTimeout:3000,requestTimeout:12000}});\nconst key=\"private/mvp/f33f33f3-\"+randomUUID().slice(9);\nlet created=false,failed=false,stage=\"configuration\";\nasync function head(){\n  try{return await client.send(new HeadObjectCommand({Bucket:process.env.MVP_S3_BUCKET,Key:key}));}\n  catch(error){if(error.$metadata?.httpStatusCode===404)return null;throw error;}\n}\nasync function main(){\n try{\n  assert.equal(process.env.MVP_S3_BUCKET,\"beautyplatform-private-photos-dev\");\n  assert.equal(process.env.AWS_REGION,\"eu-north-1\");\n  assert.match(key,/^private\\/mvp\\/f33f33f3-[0-9a-f-]{27}$/);\n  assert.equal(process.env.MVP_AI_ENABLED,\"false\");\n  assert.equal(process.env.MVP_PHOTO_POLICY_REVIEWED,\"false\");\n  stage=\"normalization\";\n  const png=await sharp({create:{width:32,height:32,channels:3,background:\"#808080\"}}).withExif({IFD0:{Copyright:\"Synthetic runtime storage probe\"}}).png().toBuffer();\n  const jpeg=await store.normalize(png,\"image/png\");\n  assert.equal((await sharp(jpeg).metadata()).exif,undefined);\n  console.log(\"SYNTHETIC_NORMALIZATION_AND_METADATA_REMOVAL: PASS\");\n  stage=\"put\";\n  await store.put(key,jpeg);created=true;\n  const metadata=await head();\n  assert.equal(metadata?.ServerSideEncryption,\"AES256\");\n  const sanitized=await store.sanitizedJpeg(key,jpeg.length,\"image/jpeg\");\n  assert.equal((await sharp(sanitized).metadata()).format,\"jpeg\");\n  console.log(\"RUNTIME_SYNTHETIC_PRIVATE_UPLOAD_AND_READ: PASS\");\n  stage=\"anonymous-denial\";\n  const response=await fetch(\"https://beautyplatform-private-photos-dev.s3.eu-north-1.amazonaws.com/\"+key,{redirect:\"error\",signal:AbortSignal.timeout(12000)});\n  await response.body?.cancel();\n  assert.ok(response.status===403||response.status===404);\n  console.log(\"SYNTHETIC_ANONYMOUS_DOWNLOAD_DENIED: PASS\");\n }catch{\n  console.log(\"SYNTHETIC_STORAGE_CHECK_FAILED_AT_\"+stage);\n  failed=true;\n }finally{\n  try{\n   if(created){await store.erase(key);console.log(\"OWN_SYNTHETIC_DELETE_ACKNOWLEDGED: PASS\");}\n  }catch{console.log(\"OWN_SYNTHETIC_ERASURE_NOT_VERIFIED\");failed=true;}\n  store.onModuleDestroy();client.destroy();\n }\n if(failed)process.exitCode=1;\n}\nmain().catch(()=>{console.log(\"SYNTHETIC_STORAGE_PROBE_FAILED\");process.exitCode=1;});\n"
allowed=[
'SYNTHETIC_NORMALIZATION_AND_METADATA_REMOVAL: PASS',
'RUNTIME_SYNTHETIC_PRIVATE_UPLOAD_AND_READ: PASS',
'SYNTHETIC_ANONYMOUS_DOWNLOAD_DENIED: PASS',
'OWN_SYNTHETIC_DELETE_ACKNOWLEDGED: PASS',
'OWN_SYNTHETIC_ERASURE_NOT_VERIFIED','SYNTHETIC_STORAGE_PROBE_FAILED',
'SYNTHETIC_STORAGE_CHECK_FAILED_AT_configuration','SYNTHETIC_STORAGE_CHECK_FAILED_AT_normalization','SYNTHETIC_STORAGE_CHECK_FAILED_AT_put','SYNTHETIC_STORAGE_CHECK_FAILED_AT_anonymous-denial']
result=subprocess.run(['docker','exec','-i','beauty-preview-api-1','node','--max-old-space-size=96','-'],input=source,capture_output=True,text=True,timeout=120)
lines=result.stdout.splitlines()
for line in lines:
    if line in allowed:print(line,flush=True)
if result.returncode or any(line not in lines for line in allowed[:4]):raise SystemExit('Synthetic storage acceptance incomplete; do not enable real-photo uploads')
print('S3 DeleteObject acknowledged; independent absence listing is not granted to the runtime role and is not claimed.',flush=True)
print('Reserved new synthetic object only; no real photo, database change, paid AI call or rollout change.',flush=True)
PY
