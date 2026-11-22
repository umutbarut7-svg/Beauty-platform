#!/usr/bin/env python3
"""Bounded encrypted-frame relay: owner terminal -> memory -> child stdin pipe.

No private key, password, filename, transcript, or backup input is accepted here.
The existing owner operator retains its account/host/package/restore gates.
"""
from datetime import datetime, timezone
import base64
import errno
import fcntl
import json
import os
import pty
import re
import selectors
import signal
import struct
import subprocess
import termios
import time

BEGIN = b'ORZELL-CAPSULE-V1'
END = b'END-ORZELL-CAPSULE'
MAX_FRAME = 56000
MAX_LINE = 8192


def unique(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('DUPLICATE_ENVELOPE_FIELD')
        value[key] = item
    return value


def validate_frame(raw, challenge_sha):
    if not isinstance(raw, (bytes, bytearray)) or not 0 < len(raw) <= MAX_FRAME:
        raise ValueError('ENCRYPTED_FRAME_LIMIT')
    lines = bytes(raw).rstrip(b'\r\n').splitlines()
    if len(lines) < 3 or lines[0] != BEGIN or lines[-1] != END:
        raise ValueError('SINGLE_ENCRYPTED_FRAME_REQUIRED')
    if any(not re.fullmatch(rb'[A-Za-z0-9+/=]{1,256}', line) for line in lines[1:-1]):
        raise ValueError('SINGLE_ENCRYPTED_FRAME_REQUIRED')
    encoded = b''.join(lines[1:-1])
    packet = base64.b64decode(encoded, validate=True)
    if not 0 < len(packet) <= 40000 or base64.b64encode(packet) != encoded:
        raise ValueError('CANONICAL_ENCRYPTED_ENVELOPE_REQUIRED')
    envelope = json.loads(packet, object_pairs_hook=unique)
    fields = {'version', 'kind', 'challengeSha256', 'wrappedKey', 'iv', 'ciphertext'}
    if (type(envelope) is not dict or set(envelope) != fields
            or type(envelope['version']) is not int or envelope['version'] != 1
            or envelope['kind'] != 'ORZELL_RECOVERY_KEY_HANDOFF'
            or envelope['challengeSha256'] != challenge_sha
            or json.dumps(envelope, sort_keys=True, separators=(',', ':')).encode('ascii') != packet):
        raise ValueError('CURRENT_ENCRYPTED_ENVELOPE_REQUIRED')
    for name, low, high in (('wrappedKey',384,384), ('iv',12,12), ('ciphertext',17,24592)):
        item = envelope[name]
        if type(item) is not str:
            raise ValueError('ENCRYPTED_ENVELOPE_PROFILE_REQUIRED')
        decoded = base64.b64decode(item, validate=True)
        if not low <= len(decoded) <= high or base64.b64encode(decoded).decode('ascii') != item:
            raise ValueError('ENCRYPTED_ENVELOPE_PROFILE_REQUIRED')
    # Only transport line endings are normalized. Encrypted packet bytes are unchanged.
    return b'\n'.join(lines) + b'\n'


def write_all(fd, data):
    while data:
        count = os.write(fd, data)
        if count <= 0:
            raise OSError('OUTPUT_CLOSED')
        data = data[count:]


def run_interactive(command, receipt, *, stdin=None, mirror=None, timeout_seconds=1200):
    source_fd = 0 if stdin is None else (stdin if isinstance(stdin, int) else stdin.fileno())
    if not os.isatty(source_fd):
        raise ValueError('OWNER_TERMINAL_REQUIRED')
    sink = mirror or (lambda data: write_all(1, data))
    def mirror(data):
        try:
            sink(data)
        except OSError:
            pass
    old_attrs = termios.tcgetattr(source_fd)
    old_blocking = os.get_blocking(source_fd)
    master, slave = pty.openpty()
    process = None
    input_changed = False
    frame = bytearray()
    pending = bytearray()
    output_line = bytearray()
    dropping = False
    ready = False
    submitted = False
    challenge_sha = None
    intake_deadline = None
    last_progress = 0
    received_bytes = 0
    code = 1
    try:
        try:
            size = os.get_terminal_size(source_fd)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', size.lines, size.columns, 0, 0))
        except OSError:
            pass
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=slave, stderr=slave,
                                   close_fds=True, start_new_session=True)
        os.close(slave)
        slave = None
        os.set_blocking(process.stdin.fileno(), False)
        deadline = time.monotonic() + timeout_seconds
        startup_deadline = time.monotonic() + min(timeout_seconds,90)
        with selectors.DefaultSelector() as selector:
            selector.register(master, selectors.EVENT_READ, 'output')
            while True:
                now = time.monotonic()
                active_deadline = min(deadline, intake_deadline) if ready and not submitted else deadline
                if not ready:
                    active_deadline = min(active_deadline,startup_deadline)
                if now >= active_deadline:
                    raise ValueError('OWNER_TRANSPORT_DEADLINE')
                events = selector.select(min(active_deadline - now, 10))
                if not events:
                    if time.monotonic() >= active_deadline:
                        raise ValueError('OWNER_TRANSPORT_DEADLINE')
                    if ready:
                        mirror((b'\r\n'+json.dumps({'status':'OWNER_WAITING_FOR_RESULT' if submitted else 'OWNER_WAITING_FOR_CAPSULE',
                                'receivedBytes':received_bytes,'frameForwarded':submitted}).encode()+b'\r\n'))
                    continue
                ended = False
                for key, _ in events:
                    if key.data == 'output':
                        try:
                            chunk = os.read(master,4096)
                        except OSError as exc:
                            if exc.errno != errno.EIO:
                                raise
                            chunk = b''
                        if not chunk:
                            ended = True
                            break
                        receipt.feed(chunk)
                        announce_ready = False
                        for piece in chunk.splitlines(keepends=True):
                            if not dropping and len(output_line)+len(piece) <= MAX_LINE:
                                output_line.extend(piece)
                            else:
                                output_line.clear()
                                dropping = True
                            if piece.endswith(b'\n'):
                                if not dropping:
                                    try:
                                        value = json.loads(bytes(output_line), object_pairs_hook=unique)
                                    except (ValueError, UnicodeError):
                                        value = None
                                    if isinstance(value, dict) and value.get('status') == 'WAITING_FOR_ENCRYPTED_CAPSULE':
                                        if ready:
                                            raise ValueError('ONE_OWNER_CHALLENGE_REQUIRED')
                                        challenge_sha = value.get('challengeSha256')
                                        if not isinstance(challenge_sha,str) or not re.fullmatch('[0-9a-f]{64}',challenge_sha):
                                            raise ValueError('VALID_OWNER_CHALLENGE_REQUIRED')
                                        expires = datetime.strptime(value['expiresAt'],'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
                                        remaining = expires - time.time()
                                        if not 0 < remaining <= 610:
                                            raise ValueError('UNEXPIRED_OWNER_CHALLENGE_REQUIRED')
                                        intake_deadline = time.monotonic()+min(remaining,600)
                                        attrs = list(old_attrs)
                                        attrs[6] = list(old_attrs[6])
                                        attrs[0] &= ~(termios.ICRNL | termios.INLCR | termios.IGNCR | termios.IXON)
                                        attrs[3] &= ~(termios.ICANON | termios.ECHO | termios.ECHONL)
                                        attrs[6][termios.VMIN] = 1
                                        attrs[6][termios.VTIME] = 0
                                        input_changed = True
                                        termios.tcsetattr(source_fd,termios.TCSANOW,attrs)
                                        if termios.tcgetattr(source_fd)[3] & (termios.ICANON | termios.ECHO | termios.ECHONL):
                                            raise ValueError('OWNER_TERMINAL_CONFIGURATION_FAILED')
                                        os.set_blocking(source_fd,False)
                                        selector.register(source_fd,selectors.EVENT_READ,'input')
                                        ready = True
                                        announce_ready = True
                                output_line.clear()
                                dropping = False
                        try:
                            mirror(chunk)
                        except OSError:
                            pass
                        if announce_ready:
                            mirror(b'\r\n{"status":"OWNER_RELAY_INPUT_READY","receivedBytes":0,"contentSaved":false}\r\n')
                    elif key.data == 'input':
                        try:
                            chunk = os.read(source_fd,min(4096,MAX_FRAME-len(frame)+1))
                        except BlockingIOError:
                            continue
                        if not chunk:
                            raise ValueError('OWNER_INPUT_CLOSED')
                        frame.extend(chunk)
                        received_bytes += len(chunk)
                        if len(frame)>MAX_FRAME:
                            raise ValueError('ENCRYPTED_FRAME_LIMIT')
                        if len(frame)-last_progress >= 4096 or b'\n'+END in frame or b'\r'+END in frame:
                            last_progress=len(frame)
                            mirror(b'\r\n'+json.dumps({'status':'ENCRYPTED_FRAME_INPUT_PROGRESS','receivedBytes':len(frame),
                                   'endMarkerSeen':b'\n'+END in frame or b'\r'+END in frame,'contentSaved':False}).encode()+b'\r\n')
                        # CloudShell phone paste can deliver CR-only line endings.
                        # The validator still checks the full frame before forwarding.
                        if frame.endswith((b'\n',b'\r')) and (b'\n'+END in frame or b'\r'+END in frame):
                            pending.extend(validate_frame(frame,challenge_sha))
                            frame.clear()
                            selector.unregister(source_fd)
                            selector.register(process.stdin,selectors.EVENT_WRITE,'forward')
                    elif key.data == 'forward':
                        if time.monotonic() >= intake_deadline:
                            raise ValueError('OWNER_TRANSPORT_DEADLINE')
                        try:
                            count = os.write(process.stdin.fileno(),pending[:1024])
                        except BlockingIOError:
                            continue
                        if count <= 0:
                            raise ValueError('ENCRYPTED_FORWARD_FAILED')
                        del pending[:count]
                        if not pending:
                            selector.unregister(process.stdin)
                            submitted = True
                            mirror(b'\r\n'+json.dumps({'status':'ENCRYPTED_FRAME_FORWARDED','receivedBytes':received_bytes,
                                   'contentSaved':False}).encode()+b'\r\n')
                if ended:
                    break
        code = process.wait(timeout=5)
    except (Exception, KeyboardInterrupt):
        code = 130 if isinstance(__import__('sys').exc_info()[1],KeyboardInterrupt) else 1
        exc = __import__('sys').exc_info()[1]
        allowed = {'DUPLICATE_ENVELOPE_FIELD','ENCRYPTED_FRAME_LIMIT','SINGLE_ENCRYPTED_FRAME_REQUIRED',
                   'CANONICAL_ENCRYPTED_ENVELOPE_REQUIRED','CURRENT_ENCRYPTED_ENVELOPE_REQUIRED',
                   'ENCRYPTED_ENVELOPE_PROFILE_REQUIRED','OWNER_TRANSPORT_DEADLINE','ONE_OWNER_CHALLENGE_REQUIRED',
                   'VALID_OWNER_CHALLENGE_REQUIRED','UNEXPIRED_OWNER_CHALLENGE_REQUIRED','OWNER_INPUT_CLOSED',
                   'ENCRYPTED_FORWARD_FAILED','OWNER_TERMINAL_CONFIGURATION_FAILED'}
        reason = str(exc) if isinstance(exc,ValueError) and str(exc) in allowed else 'OWNER_TRANSPORT_FAILURE'
        try:
            mirror(b'\r\n'+json.dumps({'status':'OWNER_TRANSPORT_STOPPED_RESULT_NOT_VERIFIED','reason':reason,
                   'receivedBytes':received_bytes,'frameForwarded':submitted,'realRecoveryReady':False}).encode()+b'\r\n')
        except OSError:
            pass
    finally:
        if process is not None:
            if process.poll() is None:
                try:
                    os.killpg(process.pid,signal.SIGTERM)
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid,signal.SIGKILL)
                    process.wait(timeout=3)
                except ProcessLookupError:
                    pass
            if process.stdin is not None:
                process.stdin.close()
        if input_changed:
            termios.tcsetattr(source_fd,termios.TCSAFLUSH,old_attrs)
            os.set_blocking(source_fd,old_blocking)
        if slave is not None:
            os.close(slave)
        os.close(master)
        frame.clear()
        pending.clear()
        output_line.clear()
        receipt.finish(code)
    return code


if __name__ == '__main__':
    print(json.dumps({'status':'OFFLINE_NO_ACTION','privateKeyRead':False,'productionDataRead':False}))
