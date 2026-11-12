#!/usr/bin/env python3
"""Public verification of the independently pinned encrypted snapshot; no decryption."""
from contextlib import ExitStack
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

SPEC = importlib.util.spec_from_file_location("recovery_package_public", Path(__file__).with_name("recover-backup-package.py"))
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)
VERIFIED = PACKAGE.VERIFIED
MANIFEST = VERIFIED.MANIFEST
FILES = MANIFEST.FILES
ROOT = Path(__file__).resolve().parents[2]
MAX_PACKAGE = 16 * 1024 * 1024


def inspect_package(package, public_key, certificate, binding, reference):
    # Binding/reference are independent reviewed inputs, never package sidecars.
    if (not isinstance(binding, dict) or binding.get("kind") != "ENCRYPTED_SNAPSHOT_METADATA_ONLY"
            or type(binding.get("version")) is not int or binding["version"] != 1
            or any(binding.get(k) is not False for k in ("independentRecoveryApproval", "privateKeyRead", "backupBodyRead", "restoreVerified"))
            or type(binding.get("packageBytes")) is not int or not 0 < binding["packageBytes"] <= MAX_PACKAGE
            or not isinstance(binding.get("packageSha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", binding["packageSha256"])):
        raise ValueError("INDEPENDENT_PACKAGE_RECEIPT_REQUIRED")
    if (not isinstance(reference, dict) or type(reference.get("version")) is not int or reference["version"] != 1
            or reference.get("productionSchemaVerified") is not False
            or binding.get("applicationSha") != reference.get("applicationSha")
            or binding.get("sourceImage") != reference.get("sourceImage")
            or not re.fullmatch(r"[0-9a-f]{40}", str(reference.get("applicationSha", "")))
            or not re.fullmatch(r"sha256:[0-9a-f]{64}", str(reference.get("sourceImage", "")))
            or type(reference.get("evidenceRunId")) is not int or reference["evidenceRunId"] <= 0
            or not re.fullmatch(r"[0-9a-f]{64}", str(reference.get("schemaSha256", "")))
            or hashlib.sha256(Path(__file__).with_name("recovery-catalog.sql").read_bytes()).hexdigest() != reference.get("catalogQuerySha256")):
        raise ValueError("REVIEWED_SOURCE_SCHEMA_REFERENCE_REQUIRED")
    with ExitStack() as stack:
        # Check the exact receipt size before copying bytes, then detach from paths.
        source = stack.enter_context(FILES.regular_file(package))
        if os.fstat(source.fileno()).st_size != binding["packageBytes"]:
            raise ValueError("PACKAGE_RECEIPT_SIZE_MISMATCH")
        sealed = VERIFIED.snapshot_stream(stack, source, max_bytes=binding["packageBytes"])
        incoming = stack.enter_context(FILES.regular_file(sealed))
        digest, size = MANIFEST.digest(incoming)
        if digest != binding["packageSha256"] or size != binding["packageBytes"]:
            raise ValueError("PACKAGE_RECEIPT_HASH_MISMATCH")
        archive = stack.enter_context(PACKAGE.members(incoming, binding["packageBytes"]))
        entries = {}
        for name, cap in (("backup.cms", binding["packageBytes"]), ("manifest.json", PACKAGE.MAX_MANIFEST)):
            with archive.open(name) as stream:
                entries[name] = VERIFIED.snapshot_stream(stack, stream, max_bytes=cap)
        public = VERIFIED.snapshot(stack, public_key, max_bytes=16384)
        cert = VERIFIED.snapshot(stack, certificate, max_bytes=16384)
        if MANIFEST.fingerprint(cert, certificate=True) != binding.get("expectedRecipient"):
            raise ValueError("UNTRUSTED_RECIPIENT_CERTIFICATE")
        manifest = MANIFEST.verify(entries["backup.cms"], entries["manifest.json"], public,
            binding.get("expectedSigner"), binding.get("expectedRecipient"), binding.get("backupId"),
            binding.get("applicationSha"), binding.get("snapshotBoundary"), binding.get("notBefore"), binding.get("notAfter"))
        context = {"backupId": manifest["backupId"], "applicationSha": manifest["applicationSha"],
                   "cipherSha256": manifest["cipherSha256"], "recipientCertificateSha256": manifest["recipientCertificateSha256"],
                   "signingPublicKeySha256": manifest["signingPublicKeySha256"], "schemaReferenceSha256": reference["schemaSha256"],
                   "snapshotBoundary": manifest["snapshotBoundary"], "backupCreatedNotBefore": binding["notBefore"],
                   "backupCreatedNotAfter": binding["notAfter"]}
        return {"status": "ENCRYPTED_PACKAGE_AUTHENTICATED_NO_RESTORE", "backupId": manifest["backupId"],
                "packageSha256": digest, "packageBytes": size, "sourceReferenceMatched": True,
                "referenceRunId": reference["evidenceRunId"], "context": context,
                "encryptedPackageRead": True, "plaintextRead": False, "privateKeyRead": False,
                "productionSchemaVerified": False, "productionRestoreVerified": False,
                "independentRecoveryApproval": False, "realRecoveryReady": False}


def main():
    if len(sys.argv) == 1:
        print(json.dumps({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False, "plaintextRead": False}))
        return 0
    if len(sys.argv) != 3 or sys.argv[1] != "--inspect":
        print(json.dumps({"status": "UNSUPPORTED_PUBLIC_INSPECTION_ARGUMENTS"}))
        return 2
    try:
        ops = ROOT / ".github/operations"
        binding = json.loads((ops / "recovery-snapshot-20261112.json").read_text())
        reference = json.loads((ops / "recovery-schema-reference-2e56def.json").read_text())
        report = inspect_package(sys.argv[2], ops / "backup-signing-public-20261105.pem",
                                 ops / "backup-recipient-20261105.pem", binding, reference)
        print(json.dumps(report, sort_keys=True))
        return 0
    except Exception as exc:
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[A-Z_]{1,100}", str(exc)) else "PUBLIC_INSPECTION_FAILED"
        print(json.dumps({"status": "PUBLIC_INSPECTION_REJECTED", "reason": reason,
                          "privateKeyRead": False, "plaintextRead": False, "realRecoveryReady": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
