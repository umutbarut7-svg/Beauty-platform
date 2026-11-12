"""Test-only generated fixture on stdin/stdout; no files, network or owner inputs."""
from datetime import timedelta
import base64
import importlib.util
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

if os.environ.get("ORZELL_SYNTHETIC_HANDOFF_UI") != "1" or len(sys.argv) != 1:
    raise SystemExit("EXPLICIT_SYNTHETIC_FIXTURE_REQUIRED")
spec = importlib.util.spec_from_file_location("handoff_fixture", Path(__file__).with_name("recovery-key-handoff.py"))
H = importlib.util.module_from_spec(spec)
spec.loader.exec_module(H)
key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
password = b"synthetic-browser-password"
key_data = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.BestAvailableEncryption(password))
now = H.utc_now()
name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "synthetic-ui-fixture-only")])
cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
        .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1))
        .not_valid_after(now+timedelta(days=1)).sign(key, hashes.SHA256()))
cert_data = cert.public_bytes(serialization.Encoding.PEM)
context = {"backupId": "synthetic-browser-fixture", "applicationSha": "a"*40, "cipherSha256": "b"*64,
           "recipientCertificateSha256": H.hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest(),
           "signingPublicKeySha256": "c"*64, "schemaReferenceSha256": "d"*64,
           "snapshotBoundary": "SYNTHETIC_ONLY", "backupCreatedNotBefore": (now-timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "backupCreatedNotAfter": now.strftime("%Y-%m-%dT%H:%M:%SZ")}
sessions = {}
try:
    with patch.object(H.MEMORY, "host_checks"):
        for line in sys.stdin:
            request = json.loads(line)
            if request == {"action": "new"} or request == {"action": "new-live-metadata"}:
                current = dict(context)
                if request["action"] == "new-live-metadata":
                    current["snapshotBoundary"] = "LIVE_DAILY_SNAPSHOT"
                session = H.KeyHandoff(current, cert_data)
                token = str(len(sessions))
                sessions[token] = session
                response = {"id": token, "challenge": H.b64(session.challenge), "pin": session.challenge_sha256,
                            "key": H.b64(key_data), "password": password.decode()}
            elif set(request) == {"action", "id", "envelope"} and request["action"] == "unwrap":
                with sessions[request["id"]].open_key(base64.b64decode(request["envelope"], validate=True)) as (fd, pw):
                    valid = os.pread(fd, 20000, 0) == key_data and os.pread(pw, 2000, 0) == password
                closed = True
                for descriptor in (fd, pw):
                    try:
                        os.fstat(descriptor)
                        closed = False
                    except OSError:
                        pass
                response = {"ok": valid, "descriptorsClosed": closed, "productionDataRead": False}
            else:
                raise ValueError("SYNTHETIC_ACTION_REQUIRED")
            print(json.dumps(response), flush=True)
finally:
    for session in sessions.values():
        session.close()
