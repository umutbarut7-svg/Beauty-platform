"""Build and verify the exact admin-only release without any cloud credentials."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

SOURCE = '61f97f0ed996844917be036a77e36d9aad999a94'
TREE = '20e98849b6e0c8ac29a00132c60b2cc04f6aac34'
API_URL = 'https://preview.13-51-112-228.sslip.io/api'
LOGO = '16ad3fabe252740fb9ec97316ac63a4b1c4c4648ef333e0a08027c3430bc0fa4'
IMAGE = 'orzell-admin:reviewed-20261111'
CONTAINER = 'orzell-admin-release-rehearsal'

def run(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()

def main():
    application = Path('application').resolve()
    assert run(['git', 'rev-parse', 'HEAD'], cwd=application) == SOURCE
    assert run(['git', 'rev-parse', 'HEAD^{tree}'], cwd=application) == TREE
    subprocess.run(['git', 'diff', '--exit-code'], cwd=application, check=True)
    subprocess.run(['docker', 'build', '-f', 'infra/preview/Dockerfile.admin',
                    '--build-arg', 'ADMIN_API_URL=' + API_URL,
                    '--build-arg', 'APPLICATION_SOURCE=' + SOURCE,
                    '--build-arg', 'APPLICATION_TREE=' + TREE, '-t', IMAGE, '.'], cwd=application, check=True)
    image = json.loads(run(['docker', 'image', 'inspect', IMAGE]))[0]
    assert image['Config']['User'] == 'node'
    assert image['Config']['Labels']['org.opencontainers.image.revision'] == SOURCE
    assert image['Config']['Labels']['org.orzell.admin.source-tree'] == TREE
    try:
        subprocess.run(['docker', 'run', '-d', '--name', CONTAINER, '--network', 'none',
                        '--memory', '256m', '--memory-swap', '256m', '--cap-drop', 'ALL',
                        '--security-opt', 'no-new-privileges:true', IMAGE], check=True)
        script = """const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3000')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,200))}assert(ready);
for(const route of ['/','/login']){const r=await fetch('http://127.0.0.1:3000'+route),t=await r.text();assert.equal(r.status,200);assert(t.includes('<title>ORZELL · Yönetim merkezi</title>'));assert(t.includes('Giriş yap'));assert(t.includes('ORZELL · PLATFORM YÖNETİMİ'));}
const r=await fetch('http://127.0.0.1:3000/orzell-original-reference.jpg');assert.equal(r.status,200);assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),'LOGO');
const scripts=fs.readdirSync('/application/.next/static/chunks',{recursive:true}).filter(x=>x.endsWith('.js')).map(x=>fs.readFileSync('/application/.next/static/chunks/'+x,'utf8')).join('');
assert(scripts.includes('API_URL'));assert(scripts.includes('SUPER_ADMIN'));assert(!scripts.includes('https://api.example.test'));
console.log('ADMIN_IMAGE_REHEARSAL_PASSED');})().catch(e=>{console.error(e);process.exitCode=1});""".replace('LOGO', LOGO).replace('API_URL', API_URL)
        output = run(['docker', 'exec', CONTAINER, 'node', '-e', script], timeout=60)
        assert 'ADMIN_IMAGE_REHEARSAL_PASSED' in output
        state = json.loads(run(['docker', 'inspect', CONTAINER]))[0]
        assert state['HostConfig']['NetworkMode'] == 'none'
        assert not state['HostConfig'].get('PortBindings') and not state['Mounts']
        assert state['State']['Running'] and not state['State']['OOMKilled']
    finally:
        subprocess.run(['docker', 'rm', '-f', CONTAINER], check=True)
    output_dir = Path('release'); output_dir.mkdir(exist_ok=True)
    archive = output_dir / 'admin-image.tar.gz'
    with archive.open('wb') as target:
        save = subprocess.Popen(['docker', 'save', IMAGE], stdout=subprocess.PIPE)
        compressed = subprocess.run(['gzip', '-1'], stdin=save.stdout, stdout=target, check=True)
        save.stdout.close()
        assert save.wait() == 0
    digest = hashlib.sha256()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4*1024*1024), b''): digest.update(chunk)
    manifest = {'source': SOURCE, 'sourceTree': TREE, 'apiUrl': API_URL, 'image': image['Id'],
                'imageBytes': image['Size'], 'logoSha256': LOGO,
                'archive': {'name': archive.name, 'bytes': archive.stat().st_size, 'sha256': digest.hexdigest()},
                'rehearsal': 'PASS', 'network': 'none', 'publicPorts': False,
                'providerRequests': 0, 'liveDeployment': False}
    (output_dir / 'release.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps(manifest), flush=True)

if __name__ == '__main__':
    main()
