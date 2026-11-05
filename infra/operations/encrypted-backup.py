#!/usr/bin/env python3
"""Offline file encryption only; never connects to a database or cloud service."""

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile


AUTH_ENVELOPED_DATA = bytes.fromhex("2a864886f70d0109100117")


def openssl(arguments, **kwargs):
    result = subprocess.run(
        ["openssl", *arguments],
        stderr=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        check=False,
        **kwargs,
    )
    if result.returncode:
        raise ValueError("OPENSSL_OPERATION_FAILED")
    return result.stdout


def regular_file(path, private=False):
    descriptor = os.dup(path) if type(path) is int else os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    if type(path) is int:
        os.lseek(descriptor, 0, os.SEEK_SET)
    stream = os.fdopen(descriptor, "rb", buffering=0)
    info = os.fstat(descriptor)
    if not stat.S_ISREG(info.st_mode) or (
        private and (info.st_uid != os.getuid() or info.st_mode & 0o077)
    ):
        stream.close()
        raise ValueError("UNSAFE_INPUT_FILE")
    return stream


def authenticated_envelope(stream):
    # Read only the ContentInfo type, never ciphertext or decrypted contents.
    # Reject unauthenticated CBC EnvelopedData before invoking CMS decryption.
    if stream.read(1) != b"\x30":
        raise ValueError("AUTHENTICATED_CMS_REQUIRED")
    length = stream.read(1)
    if not length:
        raise ValueError("AUTHENTICATED_CMS_REQUIRED")
    if length[0] > 0x80:
        count = length[0] & 0x7F
        if count > 8 or len(stream.read(count)) != count:
            raise ValueError("AUTHENTICATED_CMS_REQUIRED")
    if stream.read(2) != b"\x06\x0b" or stream.read(11) != AUTH_ENVELOPED_DATA:
        raise ValueError("AUTHENTICATED_CMS_REQUIRED")
    stream.seek(0)


def transform(mode, source, destination, certificate, private_key=None, passphrase=None):
    destination = Path(destination)
    if os.path.lexists(destination):
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    # The certificate and key remain open throughout OpenSSL's use. Passing
    # /proc descriptors prevents a path replacement from selecting another key.
    with regular_file(certificate) as cert:
        cert_path = f"/proc/self/fd/{cert.fileno()}"
        descriptors = [cert.fileno()]
        public = openssl(
            ["x509", "-in", cert_path, "-text", "-noout"], pass_fds=descriptors
        ).decode("ascii")
        match = re.search(r"Public-Key: \((\d+) bit\)", public)
        if "Public Key Algorithm: rsaEncryption" not in public or not match or int(match[1]) < 3072:
            raise ValueError("RSA_3072_OR_STRONGER_REQUIRED")
        arguments = ["cms", "-" + mode, "-binary"]
        handles = []
        try:
            if mode == "encrypt":
                openssl(["x509", "-in", cert_path, "-checkend", "0", "-noout"], pass_fds=descriptors)
                arguments += ["-aes-256-gcm", "-outform", "DER", "-stream", "-recip", cert_path,
                              "-keyopt", "rsa_padding_mode:oaep", "-keyopt", "rsa_oaep_md:sha256"]
            else:
                key = regular_file(private_key, private=True)
                handles.append(key)
                descriptors.append(key.fileno())
                arguments += ["-inform", "DER", "-recip", cert_path, "-inkey", f"/proc/self/fd/{key.fileno()}"]
                if passphrase:
                    password = regular_file(passphrase, private=True)
                    handles.append(password)
                    descriptors.append(password.fileno())
                    arguments += ["-passin", f"fd:{password.fileno()}"]
                else:
                    # Never prompt on stdin (which carries the encrypted file).
                    arguments += ["-passin", "pass:"]
            incoming = regular_file(source) if source != "-" else None
            if incoming:
                handles.append(incoming)
            if mode == "decrypt":
                if incoming is None:
                    raise ValueError("DECRYPT_REQUIRES_SEEKABLE_FILE")
                authenticated_envelope(incoming)
            fd, temporary = tempfile.mkstemp(prefix=".backup-private-", dir=destination.parent)
            try:
                with os.fdopen(fd, "wb") as output:
                    result = subprocess.run(
                        ["openssl", *arguments],
                        stdin=incoming,
                        stdout=output,
                        stderr=subprocess.DEVNULL,
                        pass_fds=descriptors,
                        check=False,
                    )
                    if result.returncode or output.tell() == 0:
                        raise ValueError("BACKUP_AUTHENTICATION_OR_TRANSFORM_FAILED")
                    output.flush()
                    os.fsync(output.fileno())
                # OpenSSL may emit plaintext before rejecting its tag. Publish
                # only after success, without overwriting a concurrent output.
                os.link(temporary, destination, follow_symlinks=False)
                directory = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
            finally:
                os.unlink(temporary)
        finally:
            for handle in handles:
                handle.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["encrypt", "decrypt"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--certificate", required=True)
    parser.add_argument("--private-key")
    parser.add_argument("--passphrase-file")
    args = parser.parse_args()
    if args.mode == "decrypt" and not args.private_key:
        parser.error("decrypt requires --private-key")
    try:
        transform(args.mode, args.input, args.output, args.certificate, args.private_key, args.passphrase_file)
    except (ValueError, OSError):
        print(json.dumps({"status": "FAILED"}))
        return 1
    print(json.dumps({"status": "ENCRYPTED" if args.mode == "encrypt" else "AUTHENTICATED"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
