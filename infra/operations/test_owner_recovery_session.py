import base64
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest.mock import Mock, patch

OPS = Path(__file__).parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, OPS/path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


RUN = load('owner_session_test', 'run-recovery-session.py')
START = load('owner_start_test', 'start-owner-recovery-session.py')
BUILD = load('owner_build_test', 'build-owner-recovery-client.py')


def frame(value):
    data = base64.b64encode(value).decode()
    return ('ORZELL-CAPSULE-V1\n'+'\n'.join(data[i:i+256] for i in range(0,len(data),256))+'\nEND-ORZELL-CAPSULE\n').encode()


class OwnerSessionTests(unittest.TestCase):
    def test_framing_rejects_private_pem_oversize_noncanonical_and_trailing_commands(self):
        for raw in (b'-----BEGIN PRIVATE KEY-----\nx', frame(b'capsule')+b'echo ignored\n',
                    frame(b'') , frame(b'x'*40001), b'x'*56001,
                    frame(b'x').replace(b'eA==',b'eB==')):
            with self.subTest(raw=raw[:30]), self.assertRaises(ValueError):
                RUN.decode_frame(raw)
        self.assertEqual(RUN.decode_frame(frame(b'x'*39000)),b'x'*39000)

    def test_terminal_multiline_frame_and_expiry(self):
        read,write=os.pipe()
        try:
            os.write(write,frame(b'ciphertext'))
            self.assertEqual(RUN.read_frame(time.monotonic()+1,read),b'ciphertext')
            with self.assertRaisesRegex(ValueError,'HANDOFF_INPUT_EXPIRED'):
                RUN.read_frame(time.monotonic()-1,read)
        finally:
            os.close(read);os.close(write)

    def test_input_failure_always_closes_and_never_restores(self):
        handoff=Mock(challenge=b'{"expiresAt":"2026-11-12T23:00:00Z"}',challenge_sha256='a'*64,_deadline=0)
        bridge=Mock()
        reports=[]
        with self.assertRaisesRegex(ValueError,'EXPIRED'):
            RUN.drive_session(bridge,handoff,None,None,package_bytes=1,context={'backupId':'generated'},
                output=reports.append,reader=Mock(side_effect=ValueError('EXPIRED')))
        handoff.close.assert_called_once()
        bridge.restore_protected.assert_not_called()
        self.assertFalse(reports[-1]['capsuleSubmitted'])

    def test_offline_cli_never_echoes_private_argument(self):
        for name in ('run-recovery-session.py','start-owner-recovery-session.py'):
            p=subprocess.run([sys.executable,str(OPS/name)],capture_output=True,text=True,check=True)
            self.assertIn('OFFLINE_NO_ACTION',p.stdout)
            p=subprocess.run([sys.executable,str(OPS/name),'--private-key','sensitive-filename'],capture_output=True,text=True)
            self.assertNotEqual(p.returncode,0)
            self.assertNotIn('sensitive-filename',p.stdout+p.stderr)

    def test_owner_command_is_exact_and_bounded(self):
        params=START.owner_parameters('https://example.test/encrypted?signature=generated', 'a'*32)
        self.assertEqual(list(params),['command'])
        command=params['command'][0]
        self.assertIn('timeout -s TERM 900 env -i',command)
        self.assertIn('667576',command)
        self.assertIn('/run/orzell-owner-session.',command)
        self.assertNotIn('kms decrypt',command)
        self.assertNotIn('--private-key',command)
        self.assertEqual(subprocess.run(['bash','-n'],input=command,text=True).returncode,0)

    def test_built_client_has_exact_csp_and_no_external_requests(self):
        import hashlib,re
        html=BUILD.build()
        script=re.search('<script type="module">(.*?)</script>',html,re.S).group(1)
        style=re.search('<style>(.*?)</style>',html,re.S).group(1)
        for value in (script,style):
            self.assertIn('sha256-'+base64.b64encode(hashlib.sha256(value.encode()).digest()).decode(),html)
        self.assertIn("connect-src 'none'",html)
        for value in ('fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage','sendBeacon', '<iframe','<form'):
            self.assertNotIn(value,html)
        self.assertIn('LIVE_DAILY_SNAPSHOT',html)
        self.assertIn('generation!==epoch',html)

    def test_phone_pem_extraction_and_frame_are_not_ambiguous(self):
        import re,tempfile
        code='\n'.join(re.sub(r'^export ', '', (OPS/name).read_text(), flags=re.M)
                       for name in ('wrap-recovery-handoff.mjs','recovery-owner-client.mjs'))
        code+=r'''
const assert=v=>{if(!v)throw new Error('ASSERTION_FAILED')};
const pem='-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----';
assert(new TextDecoder().decode(extractPrivatePem('notes\n'+pem+'\ncertificate')).trim()===pem);
for(const value of [pem+'\n'+pem,'no PEM','x'.repeat(32769)]){
 let rejected=false;try{extractPrivatePem(value)}catch{rejected=true}assert(rejected);
}
const frame=frameCapsule(new Uint8Array(39000));
assert(frame.split('\n').slice(1,-2).every(v=>v.length<=256));
const receipt='OK\n'+JSON.stringify({challengeBase64:'YWJj',challengeSha256:'a'.repeat(64)});
assert(parseOwnerReceipt(receipt).encoded==='YWJj');
assert(parseOwnerReceipt(receipt).pin==='a'.repeat(64));
assert(parseOwnerReceipt(receipt.replace('YWJj','YW\nJj')).encoded==='YWJj');
for(const input of [receipt+receipt,receipt.replace('challengeSha256','missing'),
  receipt.replace('YWJj','YW!Jj'),receipt.replace('a'.repeat(64),'a'.repeat(63)),
  'x'.repeat(20001),receipt+'\n"challengeBase64": "unterminated']){
 let rejected=false;try{parseOwnerReceipt(input)}catch{rejected=true}assert(rejected);
}
'''
        with tempfile.NamedTemporaryFile(mode='w',suffix='.mjs') as script:
            script.write(code);script.flush()
            subprocess.run(['node',script.name],check=True,capture_output=True)


if __name__=='__main__':
    unittest.main()
