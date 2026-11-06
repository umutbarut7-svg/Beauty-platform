#!/usr/bin/env python3
"""Probe a phone-controlled Linux/Docker environment using synthetic data only."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import resource
import shutil
import subprocess
import tempfile
import uuid


# Same PostgreSQL 17/pgvector version as the delivered application. The index
# digest was read from Docker Hub; the runtime never resolves a mutable tag.
IMAGE = "pgvector/pgvector@sha256:01215e09bd4bd582d20230e025b6c971deeeffee49ceef1aae167e839cb62a7e"
MEMORY = 512 * 1024 * 1024
LABEL = "org.orzell.synthetic-recovery"
MARKER = "ORZELL_SYNTHETIC_RESTORE_OK"
TMPFS = {
    "/work": "rw,noexec,nosuid,nodev,size=256m,mode=0700,uid=999,gid=999",
    "/var/lib/postgresql/data": "rw,noexec,nosuid,nodev,size=1m,mode=0700",
}
SQL_PROBE = r"""
set -eu
umask 077
ulimit -c 0
stage=identity
trap 'rc=$?; if [ "$rc" != 0 ]; then printf "ORZELL_PROBE_FAILED_STAGE_%s\n" "$stage"; fi' EXIT
test "$(id -u)" = 999
test -z "$(env | sed -n '/^AWS_/p; /^OPENAI_/p; /^DATABASE_URL=/p')"
test "$(find /sys/class/net -mindepth 1 -maxdepth 1 | wc -l)" -eq 1
test -d /sys/class/net/lo
stage=initdb
initdb -D /work/db --auth-local=trust --auth-host=reject --no-sync >/dev/null 2>&1
stage=postgres_start
pg_ctl -D /work/db -l /work/server.log -o "-c listen_addresses='' -c unix_socket_directories=/work -c shared_buffers=16MB -c max_connections=8 -c log_statement=none" -w start >/dev/null 2>&1
trap 'rc=$?; if [ "$rc" != 0 ]; then printf "ORZELL_PROBE_FAILED_STAGE_%s\n" "$stage"; fi; pg_ctl -D /work/db -m immediate -w stop >/dev/null 2>&1 || true' EXIT
stage=create_databases
createdb -h /work source
createdb -h /work restored
psql -X -h /work -d source -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE EXTENSION vector;
CREATE TABLE probe (tenant integer NOT NULL, item integer NOT NULL, stock integer NOT NULL, embedding vector(3), PRIMARY KEY(tenant,item));
INSERT INTO probe VALUES (1,1,7,'[1,0,0]'),(2,1,11,'[0,1,0]');
SQL
stage=dump_restore
pg_dump -h /work -Fc -f /work/probe.dump source
pg_restore --list /work/probe.dump >/dev/null
pg_restore -h /work --exit-on-error --no-owner --no-privileges -d restored /work/probe.dump >/dev/null 2>&1
stage=verify
test "$(psql -X -h /work -d restored -At -v ON_ERROR_STOP=1 -c 'SELECT count(*)=2 AND sum(stock)=18 AND count(DISTINCT tenant)=2 FROM probe')" = t
test "$(psql -X -h /work -d restored -At -v ON_ERROR_STOP=1 -c 'SELECT stock FROM probe WHERE tenant=1 AND item=1')" = 7
test "$(psql -X -h /work -d restored -At -v ON_ERROR_STOP=1 -c \"SELECT count(*) FROM pg_extension WHERE extname='vector'\")" = 1
printf 'ORZELL_SYNTHETIC_RESTORE_OK\n'
"""


class Rejected(Exception):
    pass


def host_checks(proc=Path("/proc")):
    if os.uname().sysname != "Linux":
        raise Rejected("LINUX_REQUIRED")
    if len((proc / "swaps").read_text().splitlines()) != 1:
        raise Rejected("ACTIVE_SWAP_REQUIRES_REVIEW")
    match = re.search(r"^MemAvailable:\s+(\d+) kB$", (proc / "meminfo").read_text(), re.M)
    if not match or int(match[1]) * 1024 < 768 * 1024 * 1024:
        raise Rejected("INSUFFICIENT_AVAILABLE_MEMORY")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    fd = os.memfd_create("orzell-synthetic-probe", os.MFD_ALLOW_SEALING | os.MFD_CLOEXEC)
    try:
        os.write(fd, b"synthetic")
        seals = fcntl.F_SEAL_SEAL | fcntl.F_SEAL_SHRINK | fcntl.F_SEAL_GROW | fcntl.F_SEAL_WRITE
        fcntl.fcntl(fd, fcntl.F_ADD_SEALS, seals)
        if fcntl.fcntl(fd, fcntl.F_GET_SEALS) != seals:
            raise Rejected("SEALED_MEMORY_UNAVAILABLE")
    finally:
        os.close(fd)


class Docker:
    def __init__(self, config):
        # Neither AWS credentials nor a user-controlled Docker context/config is
        # forwarded to the CLI. No AWS/SSM/S3 API is called by this tool.
        self.prefix = ["docker", "--host", "unix:///var/run/docker.sock", "--config", config]
        self.env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8"}

    def __call__(self, *args, timeout=30):
        result = subprocess.run(self.prefix + list(args), env=self.env, capture_output=True,
                                text=True, timeout=timeout, check=False)
        if result.returncode:
            stage = re.search(r"^ORZELL_PROBE_FAILED_STAGE_([a-z_]+)$", result.stdout, re.M)
            code = "SYNTHETIC_STAGE_" + stage[1].upper() if stage else "DOCKER_" + args[0].upper() + "_FAILED"
            raise Rejected(code)
        if len(result.stdout) > 128 * 1024:
            raise Rejected("UNEXPECTED_DOCKER_OUTPUT")
        return result.stdout.strip()


def create_args(name, image_id):
    args = ["create", "--name", name, "--label", LABEL + "=true", "--network", "none",
            "--read-only", "--user", "999:999", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true", "--memory", str(MEMORY),
            "--memory-swap", str(MEMORY), "--cpus", "1", "--pids-limit", "128",
            "--ulimit", "core=0:0", "--log-driver", "none", "--restart", "no"]
    for path, options in TMPFS.items():
        args += ["--tmpfs", path + ":" + options]
    return args + ["--entrypoint", "/bin/sh", image_id, "-ec", SQL_PROBE]


def check_container(value, name, image_id):
    host = value["HostConfig"]
    config = value["Config"]
    if (value["Name"] != "/" + name or value["Image"] != image_id
            or config["Labels"].get(LABEL) != "true" or config["User"] != "999:999"
            or config.get("Entrypoint") != ["/bin/sh"] or config.get("Cmd") != ["-ec", SQL_PROBE]
            or host["NetworkMode"] != "none" or not host["ReadonlyRootfs"]
            or host.get("Privileged") or host.get("Binds") or host.get("PortBindings")
            or host.get("VolumesFrom") or host.get("Devices") or host.get("CapAdd")
            or host.get("PidMode") or host.get("IpcMode") not in ("", "private")
            or host.get("CapDrop") != ["ALL"]
            or host.get("SecurityOpt") != ["no-new-privileges:true"]
            or host.get("Memory") != MEMORY or host.get("MemorySwap") != MEMORY
            or host.get("NanoCpus") != 1000000000 or host.get("PidsLimit") != 128
            or host.get("LogConfig", {}).get("Type") != "none"
            or host.get("RestartPolicy", {}).get("Name") != "no"
            or host.get("Tmpfs") != TMPFS
            or any(m.get("Type") != "tmpfs" for m in value.get("Mounts", []))
            or any(e.split("=", 1)[0].startswith(("AWS_", "OPENAI_", "DATABASE_URL")) for e in config.get("Env", []))):
        raise Rejected("CONTAINER_ISOLATION_NOT_VERIFIED")


def rehearse(docker, allow_pull):
    root = docker("info", "--format", "{{.DockerRootDir}}")
    if not root.startswith("/") or shutil.disk_usage(root).free < 2 * 1024**3:
        raise Rejected("INSUFFICIENT_DOCKER_DISK")
    if allow_pull:
        docker("pull", IMAGE, timeout=240)
    image = json.loads(docker("image", "inspect", IMAGE))[0]
    image_id = image["Id"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id) or IMAGE not in image.get("RepoDigests", []):
        raise Rejected("PINNED_IMAGE_NOT_VERIFIED")
    name = "orzell-synthetic-recovery-" + uuid.uuid4().hex
    try:
        docker(*create_args(name, image_id))
        value = json.loads(docker("inspect", name))[0]
        check_container(value, name, image_id)
        if value["State"]["Status"] != "created":
            raise Rejected("UNEXPECTED_CONTAINER_STATE")
        output = docker("start", "--attach", name, timeout=180)
        value = json.loads(docker("inspect", name))[0]
        check_container(value, name, image_id)
        if output != MARKER or value["State"]["Status"] != "exited" or value["State"]["ExitCode"] != 0:
            raise Rejected("SYNTHETIC_RESTORE_FAILED")
    finally:
        # A unique, tool-generated name is the only removal target. No prune,
        # production container name, external volume or user-selected path.
        docker("rm", "--force", "--volumes", name)
    if json.loads(docker("ps", "--all", "--filter", "name=^/" + name + "$", "--format", "json") or "null"):
        raise Rejected("CLEANUP_NOT_VERIFIED")
    return {"status": "SYNTHETIC_RECOVERY_ENVIRONMENT_PASSED", "image": IMAGE,
            "syntheticRestoreVerified": True, "network": "none", "publicPorts": False,
            "temporaryDatabaseRemoved": True, "productionDataRead": False,
            "privateKeyRead": False, "awsApiCalled": False, "productionRestoreVerified": False,
            "realRecoveryReady": False, "next": "REVIEW_ENVIRONMENT_AND_PREPARE_REAL_PACKAGE_HANDOFF"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-public-image-pull", action="store_true",
                        help="Download only the pinned public PostgreSQL image into the local Docker cache")
    args = parser.parse_args()
    try:
        host_checks()
        with tempfile.TemporaryDirectory(prefix="orzell-public-docker-") as config:
            report = rehearse(Docker(config), args.allow_public_image_pull)
    except (Rejected, OSError, ValueError, KeyError, IndexError, subprocess.TimeoutExpired) as exc:
        code = str(exc) if isinstance(exc, Rejected) else "ENVIRONMENT_CHECK_FAILED"
        print(json.dumps({"status": "NOT_READY", "reason": code, "productionRestoreVerified": False,
                          "privateKeyRead": False, "productionDataRead": False}))
        return 1
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
