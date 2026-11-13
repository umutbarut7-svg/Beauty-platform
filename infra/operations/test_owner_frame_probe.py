import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
import runpy
from unittest.mock import patch
from types import ModuleType, SimpleNamespace
from datetime import datetime, timedelta, timezone

SPEC = importlib.util.spec_from_file_location('owner_frame_probe', Path(__file__).with_name('probe-owner-frame-transport.py'))
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class ProbeTests(unittest.TestCase):
    def invoke(self, source, timeout=3):
        closed = []
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = probe.run([sys.executable, '-u', '-c', source],
                               timeout_seconds=timeout,
                               cleanup=lambda sid: closed.append(sid) or 'EXACT_PROBE_SESSION_TERMINATED')
        self.assertFalse(result['privateKeyRead'])
        self.assertFalse(result['productionDataRead'])
        self.assertFalse(result['restoreStarted'])
        self.assertNotIn('ORZELL_GENERATED_NON_SECRET_PROBE_', output.getvalue())
        return result, closed

    def test_generated_long_frame_through_real_reader(self):
        runner = Path(__file__).with_name('run-recovery-session.py').resolve()
        source = 'print("Starting session with SessionId: root-generated-test",flush=True)\n'
        source += probe.probe_source(str(runner), hashlib.sha256(runner.read_bytes()).hexdigest())
        result, closed = self.invoke(source)
        self.assertEqual(result['status'], 'GENERATED_FRAME_TRANSPORT_PASSED')
        self.assertTrue(result['readyObserved'])
        self.assertGreater(result['sentBytes'], 18000)
        self.assertEqual(result['sentBytes'], result['frameBytes'])
        self.assertEqual(closed, ['root-generated-test'])

    def test_no_ready_never_sends_frame_and_stops(self):
        result, closed = self.invoke('import time; print("public output",flush=True); time.sleep(5)', .15)
        self.assertFalse(result['readyObserved'])
        self.assertEqual(result['sentBytes'], 0)
        self.assertFalse(result['exactPayloadMatched'])
        self.assertEqual(closed, [])

    def test_wrong_payload_cannot_pass(self):
        source = ('import json,sys\n'
                  'print("ORZELL_PROBE_READY",flush=True)\n'
                  'sys.stdin.buffer.readline()\n'
                  'print("ORZELL_PROBE_RESULT "+json.dumps({"bytes":1,"sha256":"wrong"}),flush=True)\n')
        result, _ = self.invoke(source)
        self.assertEqual(result['status'], 'GENERATED_FRAME_TRANSPORT_NOT_VERIFIED')
        self.assertFalse(result['exactPayloadMatched'])

    def test_default_is_offline(self):
        import subprocess
        output = subprocess.check_output([sys.executable, '-I', str(Path(probe.__file__))], text=True)
        self.assertEqual(json.loads(output)['status'], 'OFFLINE_NO_ACTION')

    def test_actual_owner_relay_generated_cr_frame(self):
        runner=Path(__file__).with_name('run-recovery-session.py').resolve()
        source=probe.probe_source(str(runner),hashlib.sha256(runner.read_bytes()).hexdigest(),relay_ready=True)
        relay=runpy.run_path(str(Path(__file__).with_name('encrypted-frame-relay.py')))
        with contextlib.redirect_stdout(io.StringIO()):
            result=probe.run_generated_relay([sys.executable,'-u','-c',source],relay,timeout_seconds=3)
        self.assertEqual(result['status'],'GENERATED_OWNER_RELAY_PASSED')
        self.assertTrue(result['relayInputConfigured'])
        self.assertTrue(result['frameForwarded'])
        self.assertTrue(result['exactPayloadMatched'])
        self.assertEqual(result['injectedBytes'],result['frameBytes'])
        self.assertFalse(result['privateKeyRead'])
        self.assertFalse(result['restoreStarted'])

    def test_owner_relay_no_challenge_is_bounded(self):
        relay=runpy.run_path(str(Path(__file__).with_name('encrypted-frame-relay.py')))
        with contextlib.redirect_stdout(io.StringIO()):
            result=probe.run_generated_relay([sys.executable,'-u','-c','import time;time.sleep(1)'],relay,timeout_seconds=.15)
        self.assertEqual(result['status'],'GENERATED_OWNER_RELAY_NOT_VERIFIED')
        self.assertFalse(result['readyObserved'])
        self.assertEqual(result['injectedBytes'],0)
        self.assertFalse(result['frameForwarded'])

    def fake_aws(self, active=False):
        class SSM:
            rows = [{'SessionId':'existing'}] if active else []
            terminated = []
            def get_paginator(self, name):
                return SimpleNamespace(paginate=lambda **kwargs: [{'Sessions':self.rows}])
            def terminate_session(self, **kwargs):
                self.terminated.append(kwargs['SessionId'])
        ssm = SSM()
        stack = {'StackId':probe.STACK,'StackStatus':'CREATE_COMPLETE','Outputs':[
            {'OutputKey':'InstanceId','OutputValue':probe.HOST},
            {'OutputKey':'Purpose','OutputValue':'PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED'}]}
        clients = {'sts':SimpleNamespace(get_caller_identity=lambda:{'Account':'926642724499'}),
                   'cloudformation':SimpleNamespace(describe_stacks=lambda **kwargs:{'Stacks':[stack]}),
                   'ssm':ssm}
        boto = ModuleType('boto3')
        boto.Session = lambda **kwargs:SimpleNamespace(client=lambda name, **options:clients[name])
        config = ModuleType('botocore.config')
        config.Config = lambda **kwargs:None
        return ssm, {'boto3':boto,'botocore.config':config}

    def test_active_session_blocks_probe_start(self):
        ssm, modules = self.fake_aws(active=True)
        with patch.dict(sys.modules, modules), patch.object(probe,'run') as launch:
            with self.assertRaisesRegex(ValueError,'ACTIVE_SESSION_EXISTS_NO_PROBE_STARTED'):
                probe.start()
            launch.assert_not_called()
        self.assertEqual(ssm.terminated, [])

    def test_cleanup_only_closes_current_probe_session(self):
        for stale in (False, True):
            ssm, modules = self.fake_aws()
            def launch(command, cleanup):
                ssm.rows = [{'SessionId':'root-generated-test','Target':probe.HOST,
                             'StartDate':datetime.now(timezone.utc)-timedelta(hours=1 if stale else 0)}]
                return cleanup('root-generated-test')
            with patch.dict(sys.modules, modules), patch.object(probe,'run',side_effect=launch):
                status = probe.start()
            self.assertEqual(ssm.terminated, [] if stale else ['root-generated-test'])
            self.assertEqual(status, 'PROBE_SESSION_BINDING_REJECTED' if stale else 'EXACT_PROBE_SESSION_TERMINATED')


if __name__ == '__main__':
    unittest.main()
