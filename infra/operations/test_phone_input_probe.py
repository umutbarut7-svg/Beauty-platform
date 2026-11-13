import importlib.util
import os
from pathlib import Path
import pty
import termios
import threading
import unittest

spec = importlib.util.spec_from_file_location('phone_probe', Path(__file__).with_name('probe-phone-input.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class PhoneInputTests(unittest.TestCase):
    def exercise(self, data, timeout=0.4):
        master, slave = pty.openpty()
        attrs = termios.tcgetattr(slave)
        blocking = os.get_blocking(slave)
        messages = []
        ready = threading.Event()
        result = []
        def output(value):
            messages.append(value)
            if value['status'] == 'READY_FOR_PUBLIC_INPUT_PROBE':
                ready.set()
        thread = threading.Thread(target=lambda: result.append(probe.run_probe(slave, timeout_seconds=timeout, output=output)))
        try:
            thread.start()
            self.assertTrue(ready.wait(1))
            for offset in range(0, len(data), 1024):
                os.write(master, data[offset:offset+1024])
            thread.join(2)
            self.assertFalse(thread.is_alive())
            self.assertEqual(attrs, termios.tcgetattr(slave))
            self.assertEqual(blocking, os.get_blocking(slave))
            return result[0], messages
        finally:
            os.close(master)
            thread.join(2)
            os.close(slave)

    def test_phone_sized_public_frame_and_crlf_pass_without_echo(self):
        self.assertGreater(len(probe.EXPECTED), 18000)
        code, values = self.exercise(probe.EXPECTED.replace(b'\n', b'\r\n'), timeout=2)
        self.assertEqual(code, 0)
        self.assertTrue(values[-1]['exactPublicProbeMatched'])
        self.assertNotIn('0123456789ABCDEF', str(values))

    def test_cr_only_phone_paste_finishes_without_deadline(self):
        code, values = self.exercise(probe.EXPECTED.replace(b'\n', b'\r'), timeout=0.5)
        self.assertEqual(code, 0)
        self.assertEqual(values[-1]['reason'], 'COMPLETE_PUBLIC_FRAME')
        self.assertTrue(values[-1]['exactPublicProbeMatched'])

    def test_enter_only_is_distinct_from_no_input(self):
        _, no_input = self.exercise(b'')
        _, enter = self.exercise(b'\r')
        self.assertEqual(no_input[-1]['receivedBytes'], 0)
        self.assertEqual(enter[-1]['receivedBytes'], 1)
        self.assertFalse(enter[-1]['startMarkerSeen'])

    def test_wrong_private_like_input_is_never_echoed_or_forwarded(self):
        value = b'-----BEGIN PRIVATE KEY-----\nDO-NOT-PRINT-THIS\n' + probe.END + b'\n'
        code, messages = self.exercise(value)
        self.assertNotEqual(code, 0)
        self.assertNotIn('DO-NOT-PRINT-THIS', str(messages))
        self.assertNotIn('PRIVATE KEY', str(messages))
        self.assertFalse(messages[-1]['exactPublicProbeMatched'])


if __name__ == '__main__':
    unittest.main()
