#!/usr/bin/env python3
"""Bounded offline package verification/decryption. Never restores a database."""

import argparse
from contextlib import ExitStack
import importlib.util
import json
import os
from pathlib import Path
import stat
import struct
import zipfile


SPEC = importlib.util.spec_from_file_location("verified_backup", Path(__file__).with_name("verified-backup.py"))
VERIFIED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIED)
FILES = VERIFIED.MANIFEST.FILES
MAX_MANIFEST = 64 * 1024
MAX_KEY = 1024 * 1024
HARD_PACKAGE_LIMIT = 1024 * 1024 * 1024


def members(archive_stream, max_cipher_bytes):
    # Inspect the fixed-size no-comment EOCD before ZipFile can allocate an
    # unbounded central-directory list. Our producer's <=1GiB files need no ZIP64.
    size = os.fstat(archive_stream.fileno()).st_size
    if size < 22:
        raise ValueError("INVALID_PACKAGE")
    archive_stream.seek(-22, os.SEEK_END)
    signature, disk, directory_disk, count_disk, count, directory_size, directory_offset, comment = struct.unpack("<4s4H2LH", archive_stream.read(22))
    if (signature != b"PK\x05\x06" or disk != 0 or directory_disk != 0 or count_disk != 2 or count != 2
            or comment != 0 or not 0 < directory_size <= 4096 or directory_offset + directory_size != size - 22):
        raise ValueError("FIXED_PACKAGE_DIRECTORY_REQUIRED")
    archive_stream.seek(0)
    archive = zipfile.ZipFile(archive_stream)
    try:
        infos = archive.infolist()
        if len(infos) != 2 or {item.filename for item in infos} != {"backup.cms", "manifest.json"}:
            raise ValueError("FIXED_PACKAGE_MEMBERS_REQUIRED")
        for item in infos:
            limit = max_cipher_bytes if item.filename == "backup.cms" else MAX_MANIFEST
            kind = stat.S_IFMT(item.external_attr >> 16)
            if (item.orig_filename != item.filename or item.compress_type != zipfile.ZIP_STORED
                    or item.flag_bits & ~0x800 or kind not in (0, stat.S_IFREG)
                    or not 0 < item.file_size <= limit or item.compress_size != item.file_size
                    or item.extra or item.comment):
                raise ValueError("UNSAFE_PACKAGE_MEMBER")
        return archive
    except BaseException:
        archive.close()
        raise


def recover(package, output, public_key, certificate, private_key, expected_signer,
            expected_recipient, backup_id, application_sha, boundary, not_before,
            not_after, max_package_bytes, max_cipher_bytes, passphrase=None, now=None):
    for value in (max_package_bytes, max_cipher_bytes):
        if type(value) is not int or not 0 < value <= HARD_PACKAGE_LIMIT:
            raise ValueError("INVALID_PACKAGE_LIMIT")
    if max_cipher_bytes > max_package_bytes:
        raise ValueError("INVALID_PACKAGE_LIMIT")
    destination = Path(output)
    # The operator must provide a private recovery workspace. This check is not
    # protection against root/same-user path changes or a crash during decryption.
    directory = destination.parent.lstat()
    if not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.getuid() or directory.st_mode & 0o077:
        raise ValueError("PRIVATE_RECOVERY_DIRECTORY_REQUIRED")
    if os.path.lexists(destination):
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    with ExitStack() as stack:
        sealed_package = VERIFIED.snapshot(stack, package, max_bytes=max_package_bytes)
        incoming = stack.enter_context(FILES.regular_file(sealed_package))
        archive = stack.enter_context(members(incoming, max_cipher_bytes))
        entries = {}
        for name, limit in [("backup.cms", max_cipher_bytes), ("manifest.json", MAX_MANIFEST)]:
            with archive.open(name) as source:
                entries[name] = VERIFIED.snapshot_stream(stack, source, max_bytes=limit)
        public = VERIFIED.snapshot(stack, public_key, max_bytes=MAX_KEY)
        cert = VERIFIED.snapshot(stack, certificate, max_bytes=MAX_KEY)
        private = VERIFIED.snapshot(stack, private_key, private=True, max_bytes=MAX_KEY)
        password = VERIFIED.snapshot(stack, passphrase, private=True, max_bytes=MAX_KEY) if passphrase is not None else None
        return VERIFIED.decrypt(entries["backup.cms"], entries["manifest.json"], public, cert, private,
                                destination, expected_signer, expected_recipient, backup_id,
                                application_sha, boundary, not_before, not_after, password, now)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ["package", "output", "public-key", "certificate", "private-key", "expected-signer",
                 "expected-recipient", "backup-id", "application-sha", "boundary", "not-before", "not-after"]:
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--max-package-bytes", required=True, type=int)
    parser.add_argument("--max-cipher-bytes", required=True, type=int)
    parser.add_argument("--passphrase", help="Protected file path")
    try:
        recover(**vars(parser.parse_args()))
    except (ValueError, OSError, RecursionError, AttributeError, zipfile.BadZipFile, NotImplementedError):
        print('{"status":"FAILED"}')
        return 1
    print(json.dumps({"status": "PACKAGE_VERIFIED_AND_DECRYPTED"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
