"""Real controlling-TTY regression for the noninteractive owner shell wrapper."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import pty
import selectors
import shlex
import signal
import subprocess
import sys
import termios
import time
import unittest

SPEC=importlib.util.spec_from_file_location('tty_owner',Path(__file__).with_name('start-owner-recovery-session.py'))
owner=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(owner)


class ForegroundTests(unittest.TestCase):
    def exercise(self, remove_foreground=False, send_input=True):
        command=owner.owner_parameters('https://example.invalid/generated','0'*32)['command'][0]
        body=shlex.split(command)[3]
        argv=shlex.split(next(line for line in body.splitlines() if line.startswith('timeout ')))
        self.assertIn('--foreground',argv)
        self.assertEqual(argv[argv.index('TERM')+1],'900')
        argv[argv.index('900')]='1'
        if remove_foreground:
            argv.remove('--foreground')
        generated='import os,json;print(json.dumps({"pid":os.getpid()}),flush=True);os.read(0,64);print("GENERATED_INPUT_READ",flush=True)'
        index=argv.index('python3')
        argv[index:]=[sys.executable,'-u','-c',generated]
        master,slave=pty.openpty()
        def controlling_tty():
            os.setsid()
            fcntl.ioctl(0,termios.TIOCSCTTY,0)
            os.tcsetpgrp(0,os.getpgrp())
        child=subprocess.Popen(['sh','-c','trap : EXIT\n'+shlex.join(argv)],
            stdin=slave,stdout=slave,stderr=slave,preexec_fn=controlling_tty)
        os.close(slave)
        output=bytearray()
        state=None
        sent=False
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(master,selectors.EVENT_READ)
                deadline=time.monotonic()+4
                while time.monotonic()<deadline:
                    if not selector.select(.1):
                        continue
                    try:
                        block=os.read(master,4096)
                    except OSError:
                        break
                    if not block:
                        break
                    output.extend(block)
                    if not sent and b'"pid"' in output:
                        pid=json.loads(bytes(output).splitlines()[0])['pid']
                        time.sleep(.05)
                        state=next(line for line in Path('/proc',str(pid),'status').read_text().splitlines() if line.startswith('State:'))
                        if send_input:
                            os.write(master,b'GENERATED_ONLY\n')
                        sent=True
            code=child.wait(timeout=3)
            return state,b'GENERATED_INPUT_READ' in output,code
        finally:
            if child.poll() is None:
                os.killpg(child.pid,signal.SIGKILL)
                child.wait(timeout=3)
            os.close(master)

    def test_previous_wrapper_reproduces_job_control_stop(self):
        state,read,code=self.exercise(remove_foreground=True)
        self.assertIn('T (stopped)',state)
        self.assertFalse(read)
        self.assertEqual(code,124)

    def test_fixed_owner_wrapper_reads_terminal(self):
        state,read,code=self.exercise()
        self.assertNotIn('T (stopped)',state)
        self.assertTrue(read)
        self.assertEqual(code,0)

    def test_foreground_still_enforces_deadline(self):
        state,read,code=self.exercise(send_input=False)
        self.assertNotIn('T (stopped)',state)
        self.assertFalse(read)
        self.assertEqual(code,124)


if __name__=='__main__':
    unittest.main()
