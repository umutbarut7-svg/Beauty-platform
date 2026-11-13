#!/usr/bin/env python3
"""Bounded non-content result capture on the owner's CloudShell, never a transcript.

This is an operator observation, not an independent or signed attestation. No AWS
client, credentials, private-file input, provisioning or production action exists.
"""
from datetime import datetime, timezone
import errno
import fcntl
import json
import math
import os
from pathlib import Path
import pty
import re
import secrets
import selectors
import stat
import struct
import subprocess
import termios
import time

MAX_LINE = 8192
MAX_FILE = 8192
SUCCESS = "OWNER_SNAPSHOT_RESTORED_TO_ISOLATED_DATABASE"
STOPPED = "OWNER_RECOVERY_SESSION_STOPPED"
REJECTED = "RECOVERY_SESSION_REJECTED"
HEX_ID = re.compile(r"[0-9a-f]{32}")
BOOL_FIELDS = ("actualBackupRestoredToIsolatedDatabase", "temporaryDatabaseRemoved",
               "domainIntegrityChecked", "domainRecordsPreservedAcrossQuarantine",
               "protectedHandoffConsumed", "privateKeyRead", "productionDataRead",
               "productionRestoreVerified", "publicPorts", "reopenAuthorized", "realRecoveryReady")
SECONDS_FIELDS = ("observedSnapshotAgeAtDrillSeconds", "handoffAndRestoreDrillSeconds",
                  "packageVerificationAndDecryptionSeconds", "controllerElapsedSeconds")


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("DUPLICATE_RESULT_FIELD")
        value[key] = item
    return value


def valid_time(item):
    if type(item) is not str or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)", item):
        return False
    try:
        datetime.fromisoformat(item.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def valid_binding(binding):
    if type(binding) is not dict:
        return False
    patterns = {"account": r"\d{12}", "region": r"eu-north-1",
                "instanceId": r"i-[0-9a-f]{17}", "runnerSource": r"[0-9a-f]{40}",
                "runnerSha256": r"[0-9a-f]{64}", "packageSha256": r"[0-9a-f]{64}",
                "backupId": r"[a-z0-9-]{1,80}", "applicationSha": r"[0-9a-f]{40}"}
    if set(binding) != set(patterns) | {"stackId"}:
        return False
    if any(type(binding[key]) is not str or not re.fullmatch(pattern, binding[key]) for key, pattern in patterns.items()):
        return False
    expected = "arn:aws:cloudformation:" + binding["region"] + ":" + binding["account"] + ":stack/orzell-protected-runtime-v1/"
    return type(binding["stackId"]) is str and re.fullmatch(re.escape(expected) + r"[0-9a-f-]{36}", binding["stackId"]) is not None


def project_result(value, receipt_id, application_sha):
    """Copy typed, fixed fields only. Unknown/error/content fields never persist."""
    if type(value) is not dict or value.get("resultReceiptId") != receipt_id:
        return None
    status = value.get("status")
    if status not in (SUCCESS, STOPPED, REJECTED) or value.get("realRecoveryReady") is not False:
        return None
    if status == SUCCESS:
        if any(type(value.get(key)) is not bool for key in BOOL_FIELDS):
            return None
        if any(value[key] is not True for key in ("temporaryDatabaseRemoved", "domainIntegrityChecked",
                "domainRecordsPreservedAcrossQuarantine", "protectedHandoffConsumed", "privateKeyRead")):
            return None
        if any(value[key] is not False for key in ("productionRestoreVerified", "publicPorts",
                                                   "reopenAuthorized", "realRecoveryReady")):
            return None
        if (value["actualBackupRestoredToIsolatedDatabase"] != value["productionDataRead"]
                or value.get("network") != "none" or value.get("sourceApplicationSha") != application_sha):
            return None
        result = {key: value[key] for key in BOOL_FIELDS}
        result.update(status=status, network="none", sourceApplicationSha=application_sha)
        for key in SECONDS_FIELDS:
            item = value.get(key)
            if type(item) not in (int, float) or not math.isfinite(item) or not 0 <= item <= 10**10:
                return None
            result[key] = item
        for key in ("drillStartedAt", "backupSnapshotAt"):
            item = value.get(key)
            if not valid_time(item):
                return None
            result[key] = item
        return result
    result = {"status": status, "realRecoveryReady": False}
    if status == STOPPED:
        if (type(value.get("capsuleSubmitted")) is not bool
                or value.get("privateMaterialMayHaveBeenProcessed") is not value["capsuleSubmitted"]):
            return None
        result.update(capsuleSubmitted=value["capsuleSubmitted"],
                      privateMaterialMayHaveBeenProcessed=value["privateMaterialMayHaveBeenProcessed"])
    # Arbitrary reason/error strings are deliberately excluded, even uppercase.
    return result


def secure_directory(path):
    path = Path(path)
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(descriptor)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        os.close(descriptor)
        raise ValueError("PRIVATE_OWNER_RESULT_DIRECTORY_REQUIRED")
    return descriptor


class ReceiptStore:
    def __init__(self, base, binding):
        if not valid_binding(binding):
            raise ValueError("FIXED_OWNER_RESULT_BINDING_REQUIRED")
        self.receipt_id = secrets.token_hex(16)
        self.directory = Path(base) / self.receipt_id
        base_fd = secure_directory(base)
        try:
            os.mkdir(self.receipt_id, mode=0o700, dir_fd=base_fd)
            self.fd = os.open(self.receipt_id, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=base_fd)
            os.fsync(base_fd)
        finally:
            os.close(base_fd)
        self.value = dict(schemaVersion=1, receiptId=self.receipt_id, binding=dict(binding),
                          createdAt=utc_now(), observation="RESULT_NOT_OBSERVED",
                          independentAttestation=False, productionReopenAuthorized=False)
        self.buffer = bytearray()
        self.dropping = False
        self.terminal_status = None
        try:
            marker = os.open("started", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
            try:
                os.fsync(marker)
            finally:
                os.close(marker)
            self._save()
        except BaseException:
            self.close()
            raise

    def _save(self):
        payload = (json.dumps(self.value, sort_keys=True, allow_nan=False) + "\n").encode()
        if len(payload) > MAX_FILE:
            raise ValueError("OWNER_RESULT_LIMIT")
        temporary = ".result-" + secrets.token_hex(8)
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=self.fd)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, "result.json", src_dir_fd=self.fd, dst_dir_fd=self.fd)
            os.fsync(self.fd)
        finally:
            try:
                os.unlink(temporary, dir_fd=self.fd)
            except FileNotFoundError:
                pass

    def feed(self, chunk):
        # At most one bounded line in memory; stdin is never passed here.
        for piece in chunk.splitlines(keepends=True):
            ended = piece.endswith(b"\n")
            if not self.dropping and len(self.buffer) + len(piece) <= MAX_LINE:
                self.buffer.extend(piece)
            else:
                self.buffer.clear()
                self.dropping = True
            if ended:
                if not self.dropping:
                    self._line(bytes(self.buffer).strip(b"\r\n"))
                self.buffer.clear()
                self.dropping = False

    def _line(self, raw):
        try:
            value = json.loads(raw, object_pairs_hook=unique_object)
            result = project_result(value, self.receipt_id, self.value["binding"]["applicationSha"])
        except (ValueError, UnicodeError, RecursionError):
            return
        if result is None:
            return
        status = result["status"]
        if self.terminal_status is not None and not (self.terminal_status == STOPPED and status == REJECTED):
            # A second success or conflicting outcome is not accepted as evidence.
            self.value["observation"] = "CONFLICTING_RESULTS_NOT_VERIFIED"
            self.value.pop("result", None)
            self.terminal_status = "CONFLICT"
        else:
            self.value.update(observation="OWNER_TERMINAL_RESULT_OBSERVED", result=result, observedAt=utc_now())
            self.terminal_status = status
            if status == STOPPED:
                self.value["capsuleSubmissionObserved"] = result["capsuleSubmitted"]
        self._save()

    def finish(self, returncode):
        self.value["sessionExitCode"] = returncode
        self.value["sessionEndedAt"] = utc_now()
        self._save()

    def close(self):
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        self.buffer.clear()


def write_all(descriptor, data):
    while data:
        written = os.write(descriptor, data)
        if written <= 0:
            raise OSError("TERMINAL_OUTPUT_CLOSED")
        data = data[written:]


def run_interactive(command, receipt, *, stdin=None, mirror=None, timeout_seconds=1200):
    """Preserve a TTY on child output; inherit stdin without intercepting it."""
    mirror = mirror or (lambda data: write_all(1, data))
    master, slave = pty.openpty()
    process = None
    try:
        try:
            size = os.get_terminal_size(0)
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", size.lines, size.columns, 0, 0))
        except OSError:
            pass
        process = subprocess.Popen(command, stdin=stdin, stdout=slave, stderr=slave, close_fds=True)
        os.close(slave)
        slave = None
        deadline = time.monotonic() + timeout_seconds
        timed_out = False
        with selectors.DefaultSelector() as selector:
            selector.register(master, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not selector.select(remaining):
                    timed_out = True
                    break
                try:
                    chunk = os.read(master, 4096)
                except OSError as exc:
                    if exc.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                # Save before mirroring: a closed browser/output pipe cannot discard
                # a complete result already received from the child.
                receipt.feed(chunk)
                try:
                    mirror(chunk)
                except OSError:
                    pass
        if timed_out:
            process.terminate()
        try:
            code = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            timed_out = True
            process.kill()
            code = process.wait()
        if timed_out:
            code = 124
        receipt.finish(code)
        return code
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if slave is not None:
            os.close(slave)
        os.close(master)


def show_last_result(base):
    """Read the newest attempt, including an interrupted/unobserved one."""
    base_fd = secure_directory(base)
    try:
        candidates = []
        for name in os.listdir(base_fd):
            if HEX_ID.fullmatch(name):
                info = os.stat(name, dir_fd=base_fd, follow_symlinks=False)
                if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
                    raise ValueError("PRIVATE_OWNER_ATTEMPT_REQUIRED")
                directory = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=base_fd)
                try:
                    marker = os.open("started", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
                    try:
                        started = os.fstat(marker)
                        if not stat.S_ISREG(started.st_mode) or started.st_uid != os.getuid() or stat.S_IMODE(started.st_mode) != 0o600 or started.st_size != 0:
                            raise ValueError("PRIVATE_OWNER_ATTEMPT_REQUIRED")
                        # The marker is never rewritten: an older session ending
                        # later cannot hide a newer interrupted attempt.
                        candidates.append((started.st_mtime_ns, name))
                    finally:
                        os.close(marker)
                finally:
                    os.close(directory)
        if not candidates:
            return {"status": "NO_SAVED_OWNER_RESULT"}
        _, name = max(candidates)
        directory = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=base_fd)
        try:
            descriptor = os.open("result.json", os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
            with os.fdopen(descriptor, "rb") as stream:
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > MAX_FILE:
                    raise ValueError("PRIVATE_OWNER_RESULT_FILE_REQUIRED")
                value = json.loads(stream.read(MAX_FILE + 1), object_pairs_hook=unique_object)
            if (type(value) is not dict or value.get("receiptId") != name or value.get("schemaVersion") != 1
                    or not valid_binding(value.get("binding")) or not valid_time(value.get("createdAt"))
                    or value.get("independentAttestation") is not False or value.get("productionReopenAuthorized") is not False
                    or value.get("observation") not in ("RESULT_NOT_OBSERVED", "OWNER_TERMINAL_RESULT_OBSERVED", "CONFLICTING_RESULTS_NOT_VERIFIED")):
                raise ValueError("SAVED_OWNER_RESULT_INVALID")
            safe = {key: value[key] for key in ("schemaVersion", "receiptId", "binding", "createdAt", "observation",
                                                "independentAttestation", "productionReopenAuthorized")}
            if safe["observation"] == "OWNER_TERMINAL_RESULT_OBSERVED":
                result = value.get("result")
                projected = project_result(dict(result, resultReceiptId=name), name, safe["binding"]["applicationSha"]) if type(result) is dict else None
                if projected is None or not valid_time(value.get("observedAt")):
                    raise ValueError("SAVED_OWNER_RESULT_INVALID")
                safe.update(result=projected, observedAt=value["observedAt"])
            if type(value.get("capsuleSubmissionObserved")) is bool:
                safe["capsuleSubmissionObserved"] = value["capsuleSubmissionObserved"]
            if type(value.get("sessionExitCode")) is int and -255 <= value["sessionExitCode"] <= 255 and valid_time(value.get("sessionEndedAt")):
                safe.update(sessionExitCode=value["sessionExitCode"], sessionEndedAt=value["sessionEndedAt"])
            # Local files are not a signed attestation. Unknown fields are never echoed.
            return safe
        finally:
            os.close(directory)
    finally:
        os.close(base_fd)
