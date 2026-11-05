#!/usr/bin/env python3
"""After cloud audit: run the first verified backup, then enable only new timers."""

import json
import os
from pathlib import Path
import re
import subprocess


ROOT = Path("/opt/epifiz/backup")
TIMERS = ["orzell-database-backup.timer", "orzell-backup-health.timer"]


def run(args, timeout=30):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout)
    if result.returncode:
        raise ValueError("BACKUP_ACTIVATION_COMMAND_FAILED")
    return result.stdout


def activate(request, helper, execute=run, root=ROOT):
    if (set(request) != {"request_id", "mode", "release", "signer"}
            or request["request_id"] != "orzell-managed-backup-activation-20261106-1"
            or request["mode"] != "first-backup-and-enable-timers"
            or not re.fullmatch(r"[0-9a-f]{40}", request["release"])
            or not re.fullmatch(r"[0-9a-f]{64}", request["signer"])):
        raise ValueError("FIXED_ACTIVATION_BINDING_REQUIRED")
    root = Path(root)
    settings = json.loads(helper.existing(root / "managed-config.json"))
    if settings != {"version": 1, "recipient": helper.PIN, "signer": request["signer"], "application": helper.APPLICATION,
                    "image": helper.IMAGE, "release": request["release"]}:
        raise ValueError("INSTALLED_CONFIGURATION_DIFFERS")
    release = root / "releases" / request["release"]
    for name, content in helper.units(release, root).items():
        if helper.existing(Path("/etc/systemd/system") / name, private=False) != content.encode():
            raise ValueError("PREPARED_UNIT_DIFFERS")
        if execute(["systemctl", "show", "--property=DropInPaths", "--value", name]).strip():
            raise ValueError("UNREVIEWED_UNIT_OVERRIDE")
    before = helper.services(execute)
    operation = helper.directory(root / "operations" / request["request_id"])
    if os.path.lexists(operation / "started.json"):
        raise ValueError("PRIOR_ACTIVATION_REQUIRES_INSPECTION_NO_RETRY")
    helper.publish(operation / "started.json", json.dumps(request, sort_keys=True).encode())
    execute(["systemctl", "start", "orzell-database-backup.service"], timeout=700)
    state = json.loads(execute(["/usr/bin/python3", str(release / "managed-database-backup.py"), "status"]))
    if state.get("healthy") is not True or state.get("lastAttemptStatus") != "SUCCESS":
        raise ValueError("FIRST_BACKUP_NOT_HEALTHY")
    execute(["systemctl", "start", "orzell-backup-health.service"])
    try:
        execute(["systemctl", "enable", "--now", *TIMERS])
        for name in TIMERS:
            if execute(["systemctl", "is-enabled", name]).strip() != b"enabled" or execute(["systemctl", "is-active", name]).strip() != b"active":
                raise ValueError("TIMER_NOT_ENABLED_AND_ACTIVE")
        if before != helper.services(execute):
            raise ValueError("APPLICATION_SERVICES_CHANGED")
        report = {"status": "MANAGED_BACKUP_ACTIVE", "release": request["release"], "signerPublicSha256": request["signer"],
                  "dailyIstanbulTime": "03:00", "retentionDays": 30, "hourlyHealthTimer": True, "timersEnabled": True,
                  "firstBackupHealthy": True, "lastSuccessAt": state.get("lastSuccessAt"), "notificationRouteConfigured": False,
                  "applicationServicesUnchanged": True}
        helper.publish(operation / "result.json", json.dumps(report, sort_keys=True).encode())
    except Exception:
        execute(["systemctl", "disable", "--now", *TIMERS])
        raise
    return report


if __name__ == "__main__":
    try:
        if os.geteuid() != 0:
            raise ValueError("ROOT_ACTIVATION_REQUIRED")
        print(json.dumps(activate(globals().get("ACTIVATION_REQUEST"), globals().get("INSTALLER")), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, AttributeError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "MANAGED_BACKUP_ACTIVATION_FAILED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(1)
