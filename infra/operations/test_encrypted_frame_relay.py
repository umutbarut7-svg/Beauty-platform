import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import pty
import sys
import termios
import threading
import time
import unittest

import importlib.util
_spec = importlib.util.spec_from_file_location("encrypted_frame_relay",Path(__file__).with_name("encrypted-frame-relay.py"))
relay = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(relay)

PIN = 'a'*64
RUNNER = str(Path(__file__).with_name('run-recovery-session.py').resolve())


def capsule(pin=PIN):
    packet = json.dumps({'version':1,'kind':'ORZELL_RECOVERY_KEY_HANDOFF',
                         'challengeSha256':pin,'wrappedKey':base64.b64encode(b'w'*384).decode(),
                         'iv':base64.b64encode(b'i'*12).decode(),
                         'ciphertext':base64.b64encode(b'GENERATED-CIPHERTEXT-'*600).decode()},
                        sort_keys=True,separators=(',',':')).encode()
    encoded = base64.b64encode(packet)
    return packet, b'ORZELL-CAPSULE-V1\n'+b'\n'.join(encoded[i:i+256] for i in range(0,len(encoded),256))+b'\nEND-ORZELL-CAPSULE\n'


class Receipt:
    def __init__(self):
        self.chunks = bytearray()
        self.code = None
    def feed(self,chunk):
        self.chunks.extend(chunk)
    def finish(self,code):
        self.code = code


class RelayTests(unittest.TestCase):
    def command(self,packet):
        expires = (datetime.now(timezone.utc)+timedelta(seconds=10)).strftime('%Y-%m-%dT%H:%M:%SZ')
        source = ('import hashlib,json,runpy,time\n'
                  'print(json.dumps('+repr({'status':'WAITING_FOR_ENCRYPTED_CAPSULE','challengeSha256':PIN,'expiresAt':expires})+'),flush=True)\n'
                  'r=runpy.run_path('+repr(RUNNER)+')\n'
                  'v=r["read_frame"](time.monotonic()+5)\n'
                  'print(json.dumps({"receivedDigest":hashlib.sha256(v).hexdigest()}),flush=True)\n'
                  'raise SystemExit(0 if hashlib.sha256(v).hexdigest()=='+repr(hashlib.sha256(packet).hexdigest())+' else 1)\n')
        return [sys.executable,'-u','-c',source]

    def exercise(self,frame,packet,timeout=3,partial=False):
        master,slave = pty.openpty()
        before=termios.tcgetattr(slave)
        blocking=os.get_blocking(slave)
        record=Receipt()
        console=bytearray()
        ready=threading.Event()
        outcome=[]
        def mirror(chunk):
            console.extend(chunk)
            if b'WAITING_FOR_ENCRYPTED_CAPSULE' in console:
                ready.set()
        def target():
            outcome.append(relay.run_interactive(self.command(packet),record,stdin=slave,
                           mirror=mirror,timeout_seconds=timeout))
        thread=threading.Thread(target=target)
        try:
            thread.start()
            self.assertTrue(ready.wait(2))
            if partial:
                cut=frame.index(b'\nEND-ORZELL-CAPSULE')
                os.write(master,frame[:cut])
                time.sleep(.1)
                self.assertNotIn(b'ENCRYPTED_FRAME_FORWARDED',console)
                os.write(master,frame[cut:])
            elif frame is not None:
                os.write(master,frame)
            thread.join(timeout+4)
            self.assertFalse(thread.is_alive())
            self.assertEqual(before,termios.tcgetattr(slave))
            self.assertEqual(blocking,os.get_blocking(slave))
            return outcome[0],record,bytes(console)
        finally:
            os.close(master)
            if thread.is_alive():
                thread.join(4)
            os.close(slave)

    def test_long_encrypted_frame_pipe_exact_and_tty_restored(self):
        packet,frame=capsule()
        self.assertGreater(len(frame),18000)
        code,record,console=self.exercise(frame,packet)
        self.assertEqual(code,0)
        self.assertEqual(record.code,0)
        self.assertIn(hashlib.sha256(packet).hexdigest().encode(),record.chunks)
        self.assertNotIn(frame,record.chunks)
        self.assertNotIn(frame,console)
        self.assertEqual(console.count(b'ENCRYPTED_FRAME_FORWARDED'),1)

    def test_never_forwards_incomplete_frame(self):
        packet,frame=capsule()
        self.assertEqual(self.exercise(frame,packet,partial=True)[0],0)

    def test_stale_challenge_is_not_forwarded(self):
        packet,frame=capsule('b'*64)
        code,record,console=self.exercise(frame,packet)
        self.assertNotEqual(code,0)
        self.assertNotIn(b'ENCRYPTED_FRAME_FORWARDED',console)
        self.assertNotIn(b'receivedDigest',record.chunks)

    def test_incomplete_input_deadline_restores_terminal(self):
        packet,frame=capsule()
        code,record,console=self.exercise(frame[:1024],packet,timeout=.25)
        self.assertNotEqual(code,0)
        self.assertNotIn(b'ENCRYPTED_FRAME_FORWARDED',console)

    def test_forbids_plaintext_duplicate_frame_and_trailing_command(self):
        _,frame=capsule()
        for bad in [b'-----BEGIN PRIVATE KEY-----\nabc\n',frame+frame,frame+b'echo injected\n',b'x'*(relay.MAX_FRAME+1)]:
            with self.assertRaises((ValueError,UnicodeError)):
                relay.validate_frame(bad,PIN)

    def test_transport_crlf_and_final_enter_preserve_encrypted_packet(self):
        packet,frame=capsule()
        normalized=relay.validate_frame(frame.replace(b'\n',b'\r\n')+b'\r\n',PIN)
        body=b''.join(normalized.splitlines()[1:-1])
        self.assertEqual(base64.b64decode(body),packet)

    def test_profile_and_duplicate_fields_fail_closed(self):
        packet,frame=capsule()
        value=json.loads(packet)
        for name,bad in [('version',True),('wrappedKey','YQ=='),('iv','YQ=='),('ciphertext','YQ=='),('kind','PRIVATE_KEY')]:
            edited=dict(value);edited[name]=bad
            encoded=base64.b64encode(json.dumps(edited,sort_keys=True,separators=(',',':')).encode())
            data=relay.BEGIN+b'\n'+b'\n'.join(encoded[i:i+256] for i in range(0,len(encoded),256))+b'\n'+relay.END+b'\n'
            with self.assertRaises(ValueError):
                relay.validate_frame(data,PIN)

    def test_nonterminal_input_cannot_launch_child(self):
        read,write=os.pipe()
        try:
            with self.assertRaisesRegex(ValueError,'OWNER_TERMINAL_REQUIRED'):
                relay.run_interactive(['should-never-execute'],Receipt(),stdin=read)
        finally:
            os.close(read);os.close(write)


if __name__=='__main__':
    unittest.main()
