#!/usr/bin/env python3
"""Public-only phone clipboard/terminal probe. No AWS, keys, files or restore."""
import json
import os
import select
import sys
import termios
import time

BEGIN = b'ORZELL-INPUT-PROBE-V1'
END = b'END-ORZELL-INPUT-PROBE'
EXPECTED = BEGIN + b'\n' + (b'0123456789ABCDEF' * 16 + b'\n') * 72 + END + b'\n'
LIMIT = len(EXPECTED) + 1024


def emit(value):
    print(json.dumps(value, sort_keys=True), flush=True)


def summary(data):
    # Never expose input content or its digest: unexpected input may be private.
    normal = bytes(data).replace(b'\r\n', b'\n').replace(b'\r', b'\n')
    matched = normal.rstrip(b'\n') + b'\n' == EXPECTED
    return dict(receivedBytes=len(data), expectedBytes=len(EXPECTED),
                startMarkerSeen=normal.startswith(BEGIN + b'\n'),
                endMarkerSeen=b'\n' + END in normal,
                exactPublicProbeMatched=matched)


def run_probe(fd=0, *, timeout_seconds=90, output=emit):
    if not os.isatty(fd):
        raise ValueError('INTERACTIVE_TERMINAL_REQUIRED')
    before = termios.tcgetattr(fd)
    blocking = os.get_blocking(fd)
    data = bytearray()
    reason = 'INPUT_DEADLINE'
    try:
        attrs = list(before)
        attrs[6] = list(before[6])
        attrs[0] &= ~(termios.ICRNL | termios.INLCR | termios.IGNCR | termios.IXON)
        attrs[3] &= ~(termios.ICANON | termios.ECHO | termios.ECHONL)
        attrs[6][termios.VMIN] = 1
        attrs[6][termios.VTIME] = 0
        termios.tcsetattr(fd, termios.TCSAFLUSH, attrs)
        os.set_blocking(fd, False)
        output(dict(status='READY_FOR_PUBLIC_INPUT_PROBE',
                    expectedBytes=len(EXPECTED), timeoutSeconds=timeout_seconds,
                    privateKeyRead=False, awsCalled=False, restoreStarted=False))
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            remaining = max(0, deadline - time.monotonic())
            if not select.select([fd], [], [], remaining)[0]:
                break
            chunk = os.read(fd, min(4096, LIMIT - len(data) + 1))
            if not chunk:
                reason = 'INPUT_CLOSED'
                break
            data.extend(chunk)
            output(dict(status='PUBLIC_INPUT_PROGRESS', **summary(data)))
            if len(data) > LIMIT:
                reason = 'INPUT_LIMIT'
                break
            if data.endswith((b'\n', b'\r')) and (b'\n' + END in data or b'\r' + END in data):
                reason = 'COMPLETE_PUBLIC_FRAME'
                break
        details = summary(data)
        passed = reason == 'COMPLETE_PUBLIC_FRAME' and details['exactPublicProbeMatched']
        output(dict(status='PUBLIC_PHONE_INPUT_PASSED' if passed else 'PUBLIC_PHONE_INPUT_NOT_VERIFIED',
                    reason=reason, **details,
                    privateKeyRead=False, awsCalled=False, restoreStarted=False))
        return 0 if passed else 1
    except KeyboardInterrupt:
        output(dict(status='PUBLIC_PHONE_INPUT_NOT_VERIFIED', reason='INTERRUPTED', **summary(data)))
        return 130
    finally:
        termios.tcsetattr(fd, termios.TCSAFLUSH, before)
        os.set_blocking(fd, blocking)
        data.clear()


def main():
    if sys.argv[1:] == []:
        emit(dict(status='OFFLINE_NO_ACTION', privateKeyRead=False, awsCalled=False))
        return 0
    if sys.argv[1:] != ['--start-public-input-probe']:
        emit(dict(status='UNSUPPORTED_ARGUMENTS'))
        return 2
    try:
        return run_probe()
    except Exception:
        emit(dict(status='PUBLIC_PHONE_INPUT_NOT_VERIFIED', reason='TERMINAL_UNAVAILABLE'))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
