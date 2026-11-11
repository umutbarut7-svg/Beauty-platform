#!/usr/bin/env python3
"""Library-only restore of a verified sealed dump into a disposable offline DB."""

import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import tempfile
import time
import uuid


SPEC = importlib.util.spec_from_file_location("memory_backup", Path(__file__).with_name("recover-backup-memory.py"))
MEMORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEMORY)
IMAGE = "pgvector/pgvector@sha256:01215e09bd4bd582d20230e025b6c971deeeffee49ceef1aae167e839cb62a7e"
LABEL = "org.orzell.offline-restore"
MAX_DUMP = 128 * 1024 * 1024
RAM = 1024 * 1024 * 1024
TMPFS = {"/work": "rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=999,gid=999",
         "/var/lib/postgresql/data": "rw,noexec,nosuid,nodev,size=1m,mode=0700"}
MARKER = "ORZELL_OFFLINE_RESTORE_QUARANTINED"
ROOT = Path(__file__).parent
CATALOG = (ROOT / "recovery-catalog.sql").read_text()
QUARANTINE = (ROOT / "quarantine-recovery-access.sql").read_text()
CHECK = (ROOT / "recovery-quarantine-check.sql").read_text()
PRESERVED = r'''
SELECT COALESCE(jsonb_agg(value ORDER BY value::text COLLATE "C"), '[]'::jsonb)::text FROM (
  SELECT jsonb_build_array('user', id, email, role, "createdAt") AS value FROM public."User"
  UNION ALL SELECT jsonb_build_array('business', to_jsonb(b)) FROM public."Business" b
  UNION ALL SELECT jsonb_build_array('consent', id, "ownerId", "policyVersion", "noticeHash", "expiresAt", "auditExpiresAt", "createdAt") FROM public."MvpPhotoConsent"
  UNION ALL SELECT jsonb_build_array('audit', to_jsonb(e)) FROM public."MvpPrivacyEvent" e WHERE action <> 'photo.restore.invalidated'
) preserved;
'''
REPLAY = r'''
SELECT COALESCE(jsonb_agg(value ORDER BY value::text COLLATE "C"), '[]'::jsonb)::text FROM (
  SELECT jsonb_build_array('user', to_jsonb(u)) AS value FROM public."User" u
  UNION ALL SELECT jsonb_build_array('session', to_jsonb(s)) FROM public."RefreshSession" s
  UNION ALL SELECT jsonb_build_array('credential', to_jsonb(c)) FROM public."APICredential" c
  UNION ALL SELECT jsonb_build_array('client', to_jsonb(c)) FROM public."APIClient" c
  UNION ALL SELECT jsonb_build_array('application', to_jsonb(a)) FROM public."APIApplication" a
  UNION ALL SELECT jsonb_build_array('push', to_jsonb(p)) FROM public."PushDevice" p
  UNION ALL SELECT jsonb_build_array('endpoint', to_jsonb(e)) FROM public."WebhookEndpoint" e
  UNION ALL SELECT jsonb_build_array('delivery', to_jsonb(d)) FROM public."WebhookDelivery" d
  UNION ALL SELECT jsonb_build_array('consent', to_jsonb(c)) FROM public."MvpPhotoConsent" c
  UNION ALL SELECT jsonb_build_array('photo', to_jsonb(p)) FROM public."MvpPhoto" p
  UNION ALL SELECT jsonb_build_array('analysis', to_jsonb(a)) FROM public."MvpPhotoAnalysis" a
  UNION ALL SELECT jsonb_build_array('event', to_jsonb(e)) FROM public."MvpPrivacyEvent" e
) replay;
'''


def script(expected):
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("INDEPENDENT_SCHEMA_FINGERPRINT_REQUIRED")
    body = r'''
set -eu
umask 077
ulimit -c 0
stage=environment
trap 'rc=$?; if [ "$rc" != 0 ]; then printf "ORZELL_OFFLINE_FAILED_%s\n" "$stage"; fi' EXIT
test "$(id -u)" = 999
test -z "$(env | sed -n '/^AWS_/p; /^OPENAI_/p; /^DATABASE_URL=/p')"
test "$(find /sys/class/net -mindepth 1 -maxdepth 1 | wc -l)" -eq 1
test -d /sys/class/net/lo
stage=initdb
initdb -D /work/db --auth-local=trust --auth-host=reject --no-sync >/dev/null 2>&1
pg_ctl -D /work/db -l /work/server.log -o "-c listen_addresses='' -c unix_socket_directories=/work -c shared_buffers=16MB -c max_connections=8 -c log_statement=none" -t 20 -w start >/dev/null 2>&1
trap 'rc=$?; if [ "$rc" != 0 ]; then printf "ORZELL_OFFLINE_FAILED_%s\n" "$stage"; fi; pg_ctl -D /work/db -m immediate -t 10 -w stop >/dev/null 2>&1 || true' EXIT
stage=input
cat > /work/input.dump
pg_restore --list /work/input.dump >/dev/null 2>&1
createdb -h /work restored >/dev/null 2>&1
stage=restore
pg_restore -h /work --exit-on-error --single-transaction --no-owner --no-privileges -d restored /work/input.dump >/dev/null 2>&1
cat > /work/catalog.sql <<'ORZELL_CATALOG'
@@CATALOG@@
ORZELL_CATALOG
cat > /work/quarantine.sql <<'ORZELL_QUARANTINE'
SET orzell.restore_quarantine = 'confirmed-offline';
SET orzell.auth_quarantine = 'confirmed-offline-reset';
SET orzell.restore_database = 'restored';
@@QUARANTINE@@
ORZELL_QUARANTINE
cat > /work/preserved.sql <<'ORZELL_PRESERVED'
@@PRESERVED@@
ORZELL_PRESERVED
cat > /work/replay.sql <<'ORZELL_REPLAY'
@@REPLAY@@
ORZELL_REPLAY
query() { psql -X -qAt -h /work -d restored -v ON_ERROR_STOP=1 --file="$1" > "$2" 2>/dev/null; }
fingerprint() { query /work/catalog.sql /work/catalog.json; sha256sum /work/catalog.json > /work/catalog.sha; cut -d ' ' -f 1 /work/catalog.sha; }
stage=schema
test "$(fingerprint)" = '@@EXPECTED@@'
query /work/preserved.sql /work/preserved-before.json
stage=quarantine
psql -X -q -h /work -d restored -v ON_ERROR_STOP=1 --file=/work/quarantine.sql >/dev/null 2>&1
stage=check
test "$(psql -X -qAt -h /work -d restored -v ON_ERROR_STOP=1 <<'ORZELL_CHECK'
@@CHECK@@
ORZELL_CHECK
)" = t
query /work/replay.sql /work/replay-before.json
stage=replay
psql -X -q -h /work -d restored -v ON_ERROR_STOP=1 --file=/work/quarantine.sql >/dev/null 2>&1
query /work/replay.sql /work/replay-after.json
cmp -s /work/replay-before.json /work/replay-after.json
query /work/preserved.sql /work/preserved-after.json
cmp -s /work/preserved-before.json /work/preserved-after.json
test "$(fingerprint)" = '@@EXPECTED@@'
stage=shutdown
pg_ctl -D /work/db -m fast -t 20 -w stop >/dev/null 2>&1
trap - EXIT
printf 'ORZELL_OFFLINE_RESTORE_QUARANTINED\n'
'''
    for name, value in {"CATALOG": CATALOG, "QUARANTINE": QUARANTINE, "CHECK": CHECK,
                        "PRESERVED": PRESERVED, "REPLAY": REPLAY, "EXPECTED": expected}.items():
        body = body.replace("@@" + name + "@@", value)
    return body


def bounded(arguments, environment, timeout=30, stdin=None, cap=256 * 1024):
    process = None
    try:
        started = time.monotonic()
        process = subprocess.Popen(arguments, env=environment, stdin=stdin or subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   start_new_session=True, close_fds=True)
        output = bytearray()
        with process.stdout, selectors.DefaultSelector() as selector:
            os.set_blocking(process.stdout.fileno(), False)
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                remaining = timeout - (time.monotonic() - started)
                if remaining <= 0 or not selector.select(remaining):
                    raise ValueError("RESTORE_COMMAND_DEADLINE")
                data = os.read(process.stdout.fileno(), min(65536, cap - len(output) + 1))
                if not data:
                    break
                output.extend(data)
                if len(output) > cap:
                    raise ValueError("RESTORE_OUTPUT_LIMIT")
        remaining = timeout - (time.monotonic() - started)
        if remaining <= 0:
            raise ValueError("RESTORE_COMMAND_DEADLINE")
        try:
            status = process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            raise ValueError("RESTORE_COMMAND_DEADLINE") from None
        if status:
            # Never return PostgreSQL errors, row values, arguments or raw output.
            stage = re.search(rb"^ORZELL_OFFLINE_FAILED_(environment|initdb|input|restore|schema|quarantine|check|replay|shutdown)$", output, re.M)
            if stage:
                raise ValueError("OFFLINE_RESTORE_FAILED_" + stage[1].decode("ascii").upper())
            raise ValueError("ISOLATED_RESTORE_COMMAND_FAILED")
        return output.decode("utf-8").strip()
    finally:
        if process is not None and process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)


class Docker:
    def __init__(self, config):
        self.prefix = ["/usr/bin/docker", "--host", "unix:///var/run/docker.sock", "--config", config]
        self.environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}

    def __call__(self, *args, timeout=30, stdin=None):
        return bounded(self.prefix + list(args), self.environment, timeout, stdin)


def create_args(name, image, body):
    args = ["create", "--interactive", "--name", name, "--label", LABEL + "=true", "--network", "none",
            "--read-only", "--user", "999:999", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--memory", str(RAM), "--memory-swap", str(RAM), "--cpus", "1", "--pids-limit", "128",
            "--ulimit", "core=0:0", "--log-driver", "none", "--restart", "no"]
    for path, options in TMPFS.items():
        args += ["--tmpfs", path + ":" + options]
    return args + ["--entrypoint", "/bin/sh", image, "-ec", body]


def inspect_container(value, name, image, body, image_env):
    h, c = value["HostConfig"], value["Config"]
    if (value["Name"] != "/" + name or value["Image"] != image
            or c["Labels"].get(LABEL) != "true" or c["User"] != "999:999"
            or c.get("Entrypoint") != ["/bin/sh"] or c.get("Cmd") != ["-ec", body]
            or c.get("Env") != image_env or not c.get("OpenStdin")
            or h["NetworkMode"] != "none" or not h["ReadonlyRootfs"]
            or h.get("Privileged") or h.get("Binds") or h.get("PortBindings") or h.get("PublishAllPorts")
            or h.get("VolumesFrom") or h.get("Devices") or h.get("CapAdd") or h.get("PidMode")
            or h.get("IpcMode") not in ("", "private") or h.get("CapDrop") != ["ALL"]
            or h.get("SecurityOpt") != ["no-new-privileges:true"] or h.get("Tmpfs") != TMPFS
            or h.get("Memory") != RAM or h.get("MemorySwap") != RAM or h.get("PidsLimit") != 128
            or h.get("NanoCpus") != 1000000000 or h.get("LogConfig", {}).get("Type") != "none"
            or h.get("RestartPolicy", {}).get("Name") != "no"
            or not any(x.get("Name") == "core" and x.get("Soft") == 0 and x.get("Hard") == 0 for x in h.get("Ulimits", []))
            or any(m.get("Type") != "tmpfs" for m in value.get("Mounts", []))
            or any(e.split("=", 1)[0].startswith(("AWS_", "OPENAI_", "DATABASE_URL")) for e in c.get("Env", []))):
        raise ValueError("RESTORE_ISOLATION_NOT_VERIFIED")


def _restore_sealed_dump(docker, descriptor, expected_schema, timeout):
    # Internal seam for the generated-data CI acceptance; not an intake endpoint.
    body = script(expected_schema)
    if type(timeout) is not int or not 1 <= timeout <= 300:
        raise ValueError("INVALID_RESTORE_DEADLINE")
    if type(descriptor) is not int or descriptor < 0:
        raise ValueError("SEALED_DUMP_REQUIRED")
    info = os.fstat(descriptor)
    if (not stat.S_ISREG(info.st_mode) or not 5 < info.st_size <= MAX_DUMP
            or fcntl.fcntl(descriptor, 1034) != MEMORY.SEALS or os.pread(descriptor, 5, 0) != b"PGDMP"):
        raise ValueError("SEALED_DUMP_REQUIRED")
    image = json.loads(docker("image", "inspect", IMAGE))[0]
    image_id = image["Id"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) or IMAGE not in image.get("RepoDigests", []):
        raise ValueError("PINNED_RESTORE_IMAGE_REQUIRED")
    name = "orzell-offline-restore-" + uuid.uuid4().hex
    try:
        docker(*create_args(name, image_id, body))
        value = json.loads(docker("inspect", name))[0]
        inspect_container(value, name, image_id, body, image["Config"].get("Env"))
        if value["State"]["Status"] != "created":
            raise ValueError("UNEXPECTED_RESTORE_STATE")
        with MEMORY.FILES.regular_file(descriptor) as incoming:
            result = docker("start", "--attach", "--interactive", name, timeout=timeout, stdin=incoming)
        value = json.loads(docker("inspect", name))[0]
        inspect_container(value, name, image_id, body, image["Config"].get("Env"))
        if (result != MARKER or value["State"]["Status"] != "exited"
                or value["State"]["ExitCode"] != 0 or value["State"].get("OOMKilled")):
            raise ValueError("OFFLINE_RESTORE_NOT_VERIFIED")
    finally:
        # A new unpredictable tool-generated name is the only removal target.
        docker("rm", "--force", "--volumes", name)
    if docker("ps", "--all", "--filter", "name=^/" + name + "$", "--format", "{{.ID}}"):
        raise ValueError("TEMPORARY_DATABASE_CLEANUP_NOT_VERIFIED")
    return {"status": "OFFLINE_RESTORE_QUARANTINED", "temporaryDatabaseRemoved": True,
            "network": "none", "publicPorts": False, "reopenAuthorized": False, "realRecoveryReady": False}


def recover_and_restore(package_context, expected_schema, restore_timeout, acknowledge_invalidation=False):
    # No CLI/receiver calls this with owner material. A protected handoff must
    # bind these independent expectations and obtain the reviewed scope first.
    script(expected_schema)
    if acknowledge_invalidation is not True:
        raise ValueError("OFFLINE_ACCESS_INVALIDATION_ACKNOWLEDGEMENT_REQUIRED")
    if type(restore_timeout) is not int or not 1 <= restore_timeout <= 300:
        raise ValueError("INVALID_RESTORE_DEADLINE")
    if package_context.get("max_plaintext_bytes", MAX_DUMP + 1) > MAX_DUMP:
        raise ValueError("RESTORE_DUMP_LIMIT")
    started = time.monotonic()
    with MEMORY.verified_dump(**package_context) as (descriptor, manifest):
        opened = time.monotonic()
        with tempfile.TemporaryDirectory(prefix="orzell-public-restore-docker-") as config:
            report = _restore_sealed_dump(Docker(config), descriptor, expected_schema, restore_timeout)
        report["sourceApplicationSha"] = manifest["applicationSha"]
    report["packageVerificationAndDecryptionSeconds"] = round(opened - started, 3)
    report["controllerElapsedSeconds"] = round(time.monotonic() - started, 3)
    return report


if __name__ == "__main__":
    print(json.dumps({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False, "productionDataRead": False,
                      "productionRestoreVerified": False, "realRecoveryReady": False}))
    raise SystemExit(0 if len(sys.argv) == 1 else 2)
