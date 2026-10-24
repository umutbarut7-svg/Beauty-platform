// Signing material exists only in the ephemeral macOS runner.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const cp = require("node:child_process");
process.umask(0o077);
const team = "CDL78S6U9A", bundle = "com.orzell.app";
const expectedSpki = "4abe470c88f67bcee2eed6f9a0610251ec0f7fdfae8632749b50a9c3b5e24e6a";
const root = path.join(process.env.RUNNER_TEMP, "orzell-signing");
fs.mkdirSync(root, {recursive:true, mode:0o700});
const run = (cmd,args,extra={}) => cp.execFileSync(cmd,args,{stdio:"pipe",...extra});
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const mask = value => console.log("::add-mask::"+value);
async function main() {
  if(process.platform!=="darwin") throw new Error("Signing requires macOS.");
  const appleKey=crypto.createPrivateKey(process.env.ASC_PRIVATE_KEY.trim());
  if(appleKey.asymmetricKeyType!=="ec" || appleKey.asymmetricKeyDetails?.namedCurve!=="prime256v1") throw new Error("Invalid API key.");
  const keyId=process.env.ASC_KEY_ID.trim(),issuer=process.env.ASC_ISSUER_ID.trim();
  const enc=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
  const now=Math.floor(Date.now()/1000);
  const unsigned=enc({alg:"ES256",kid:keyId,typ:"JWT"})+"."+enc({iss:issuer,iat:now-5,exp:now+600,aud:"appstoreconnect-v1"});
  const token=unsigned+"."+crypto.sign("sha256",Buffer.from(unsigned),{key:appleKey,dsaEncoding:"ieee-p1363"}).toString("base64url");
  mask(token);
  async function apple(p){
    const r=await fetch("https://api.appstoreconnect.apple.com/v1/"+p,{headers:{Authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(30000)});
    if(!r.ok) throw new Error("Apple read failed: HTTP "+r.status);
    return r.json();
  }
  console.log("Checking active Apple profile and certificate.");
  const profiles=await apple("profiles?filter[name]=ORZELL%20App%20Store&include=bundleId,certificates&limit=20");
  const candidates=profiles.data.filter(p=>p.attributes.name==="ORZELL App Store" && p.attributes.profileType==="IOS_APP_STORE" && p.attributes.profileState==="ACTIVE" && Date.parse(p.attributes.expirationDate)>Date.now());
  if(candidates.length!==1) throw new Error("Expected one active App Store profile.");
  const profile=candidates[0];
  const bundleRef=profiles.included.find(i=>i.type==="bundleIds" && i.id===profile.relationships.bundleId.data.id);
  if(bundleRef?.attributes.identifier!==bundle) throw new Error("Bundle mismatch.");
  const certRefs=new Set(profile.relationships.certificates.data.map(c=>c.id));
  const certificates=profiles.included.filter(i=>i.type==="certificates" && certRefs.has(i.id) && Date.parse(i.attributes.expirationDate)>Date.now());
  const matched=certificates.filter(c=>{
    const x=new crypto.X509Certificate(Buffer.from(c.attributes.certificateContent,"base64"));
    return x.subject.split("\n").includes("OU="+team) && sha(x.publicKey.export({format:"der",type:"spki"}))===expectedSpki;
  });
  if(matched.length!==1) throw new Error("Profile certificate must match original CSR.");
  const certDer=Buffer.from(matched[0].attributes.certificateContent,"base64");
  const cert=new crypto.X509Certificate(certDer);
  const profilePath=path.join(root,"distribution.mobileprovision");
  fs.writeFileSync(profilePath,Buffer.from(profile.attributes.profileContent,"base64"),{mode:0o600});
  const plist=run("security",["cms","-D","-i",profilePath]);
  const validation=String.raw`import sys,plistlib,datetime,json
p=plistlib.loads(sys.stdin.buffer.read())
assert p["Name"]=="ORZELL App Store"
assert p["TeamIdentifier"]==["CDL78S6U9A"]
assert p["Entitlements"]["application-identifier"]=="CDL78S6U9A.com.orzell.app"
assert p["Entitlements"].get("get-task-allow") is False
assert not p.get("ProvisionedDevices") and not p.get("ProvisionsAllDevices")
assert p["ExpirationDate"]>datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
print(json.dumps({"uuid":p["UUID"],"certificates":[__import__("base64").b64encode(c).decode() for c in p["DeveloperCertificates"]]}))
`;
  const decoded=JSON.parse(run("python3",["-c",validation],{input:plist}).toString());
  if(!decoded.certificates.some(c=>Buffer.from(c,"base64").equals(certDer))) throw new Error("Embedded profile certificate mismatch.");
  if(!/^[A-Fa-f0-9-]{36}$/.test(decoded.uuid)) throw new Error("Invalid profile UUID.");

  // Recover only the explicitly approved encrypted backup, pinned by artifact ID and digest.
  console.log("Retrieving the pinned encrypted signing backup.");
  const artifactUrl="https://api.github.com/repos/umutbarut7-svg/Beauty-platform/actions/artifacts/12567174637/zip";
  const response=await fetch(artifactUrl,{headers:{Authorization:"Bearer "+process.env.GH_TOKEN,Accept:"application/vnd.github+json"},redirect:"manual",signal:AbortSignal.timeout(30000)});
  if(response.status!==302) throw new Error("Encrypted backup download redirect unavailable: "+response.status);
  const location=response.headers.get("location");
  const target=new URL(location);
  if(target.protocol!=="https:" || !(target.hostname.endsWith(".blob.core.windows.net") || target.hostname.endsWith(".githubusercontent.com") || target.hostname.endsWith(".github.com"))) throw new Error("Unexpected artifact host.");
  const download=await fetch(location,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!download.ok) throw new Error("Encrypted backup download failed.");
  const zip=Buffer.from(await download.arrayBuffer());
  if(sha(zip)!=="0420312f2e3af69438f6a7f3a6e80598608f13150600d3b26e4815ef32fa393d") throw new Error("Encrypted backup digest mismatch.");
  const zipPath=path.join(root,"backup.zip");fs.writeFileSync(zipPath,zip);
  const manifest=JSON.parse(run("unzip",["-p",zipPath,"ORZELL-distribution-key.encrypted.json"]).toString());
  if(manifest.version!==1 || manifest.bundleId!==bundle || manifest.teamId!==team || manifest.publicKeySha256!==expectedSpki || manifest.info!=="ORZELL distribution key backup v1" || manifest.aad!==bundle+"|"+team+"|v1") throw new Error("Backup metadata mismatch.");
  console.log("Encrypted backup digest verified; recovering the matching key.");
  const material=appleKey.export({format:"der",type:"pkcs8"});
  const aes=Buffer.from(crypto.hkdfSync("sha256",material,Buffer.from(manifest.salt,"base64"),manifest.info,32));
  const decipher=crypto.createDecipheriv("aes-256-gcm",aes,Buffer.from(manifest.iv,"base64"));
  decipher.setAAD(Buffer.from(manifest.aad));decipher.setAuthTag(Buffer.from(manifest.tag,"base64"));
  const privatePem=Buffer.concat([decipher.update(Buffer.from(manifest.ciphertext,"base64")),decipher.final()]);
  const distributionKey=crypto.createPrivateKey(privatePem);
  if(sha(crypto.createPublicKey(distributionKey).export({format:"der",type:"spki"}))!==expectedSpki || !cert.checkPrivateKey(distributionKey)) throw new Error("Recovered key does not match certificate.");
  const keyPath=path.join(root,"distribution.key"),certPath=path.join(root,"distribution.cer"),p12=path.join(root,"distribution.p12");
  fs.writeFileSync(keyPath,privatePem,{mode:0o600});fs.writeFileSync(certPath,certDer);
  const pass=crypto.randomBytes(32).toString("hex"),keychainPass=crypto.randomBytes(32).toString("hex");mask(pass);mask(keychainPass);
  const keychain=path.join(root,"signing.keychain-db");
  run("openssl",["pkcs12","-export","-inkey",keyPath,"-in",certPath,"-out",p12,"-passout","env:ORZELL_P12_PASSWORD"],{env:{...process.env,ORZELL_P12_PASSWORD:pass}});
  console.log("Preparing ephemeral signing keychain.");
  const oldList=run("security",["list-keychains","-d","user"]).toString().match(/"([^"]+)"/g)?.map(s=>s.slice(1,-1))??[];
  fs.writeFileSync(path.join(root,"old-keychains.json"),JSON.stringify(oldList));
  run("security",["create-keychain","-p",keychainPass,keychain]);
  run("security",["set-keychain-settings","-lut","7200",keychain]);
  run("security",["unlock-keychain","-p",keychainPass,keychain]);
  run("security",["import",p12,"-P",pass,"-A","-t","cert","-f","pkcs12","-k",keychain]);
  run("security",["set-key-partition-list","-S","apple-tool:,apple:,codesign:","-s","-k",keychainPass,keychain]);
  run("security",["list-keychains","-d","user","-s",keychain,...oldList]);
  const identities=run("security",["find-identity","-v","-p","codesigning",keychain]).toString();
  const certSha1=crypto.createHash("sha1").update(certDer).digest("hex").toUpperCase();
  if(!identities.includes(certSha1)) throw new Error("Distribution identity is not valid in signing keychain.");
  const destDir=path.join(process.env.HOME,"Library/Developer/Xcode/UserData/Provisioning Profiles");
  fs.mkdirSync(destDir,{recursive:true});
  const installed=path.join(destDir,decoded.uuid+".mobileprovision");fs.copyFileSync(profilePath,installed);
  fs.writeFileSync(path.join(root,"installed-profile.txt"),installed);
  const exportOptions={method:"app-store-connect",destination:"export",teamID:team,signingStyle:"manual",signingCertificate:certSha1,provisioningProfiles:{[bundle]:profile.attributes.name},manageAppVersionAndBuildNumber:false,uploadSymbols:true};
  run("python3",["-c","import sys,json,plistlib; plistlib.dump(json.loads(sys.stdin.read()),open(sys.argv[1],'wb'))",path.join(root,"ExportOptions.plist")],{input:JSON.stringify(exportOptions)});
  fs.appendFileSync(process.env.GITHUB_ENV,"ORZELL_PROFILE_NAME=ORZELL App Store\nORZELL_CERT_SHA1="+certSha1+"\nORZELL_KEYCHAIN="+keychain+"\n");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,"## Signing verified\n\nOriginal encrypted key recovered on temporary runner; public key matches certificate and App Store profile. Bundle and team entitlements verified. No private material published.\n");
  console.log("Distribution identity imported; profile and original signing key verified.");
  for(const name of ["distribution.key","distribution.p12","distribution.cer","backup.zip"]) fs.rmSync(path.join(root,name),{force:true});
  privatePem.fill(0);aes.fill(0);material.fill(0);
}
main().catch(()=>{console.error("::error::Signing preparation failed. Private material was not logged.");process.exitCode=1;});
