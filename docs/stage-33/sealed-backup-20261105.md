# Sealed verification and decryption

`infra/operations/verified-backup.py` joins the existing manifest verification and
CMS decryption on Linux. It snapshots ciphertext, manifest, signer public key,
recipient certificate, recipient private key and optional passphrase into separate
anonymous memfds, then applies kernel write/grow/shrink/seal seals. Verification
and decryption consume the same sealed descriptors. Replacing or modifying the
original paths after verification cannot change the bytes consumed by decryption.
The actual recipient certificate is checked against the independently supplied
fingerprint before decrypting. Private-key permissions are checked before copying.
Descriptor inputs are duplicated and rewound; path inputs reject symlinks and
nonregular files, including FIFOs without waiting for a writer.

The CLI accepts the existing manifest verification flags, plus `--certificate`,
`--private-key`, `--output` and optional `--passphrase-file`. It prints status only.
No trust values are derived from the untrusted manifest. No database/cloud access,
service restart, live backup or restore occurs in this tool.

Eight new tests cover real verified round trip, source replacement after successful
verification, kernel write/truncate refusal, invalid signer, certificate mismatch,
wrong private key and temporary plaintext cleanup, FIFO rejection, and original
private-key permissions. The existing PostgreSQL matrix now uses the combined
verified decryption path before the isolated database restore.

Boundary: Linux memfd/seal support and enough memory/swap are required. The sealed
snapshot is immutable within the normal process threat model; it does not defend
against a compromised kernel/root or arbitrary code execution in the recovery
process. Memfd is not a promise of locked/unswappable memory. Inputs are copied
in bounded chunks but their total size is not capped. Closing descriptors removes
the anonymous staging objects, including on process exit. The authenticated
plaintext output is intentionally published for the subsequent offline restore;
power-loss remnants of the existing plaintext temp/output files still require a
protected recovery volume and crash cleanup. These remain operational gates.

Off-host production backup scheduling, retention/RPO/RTO, monitoring, independent
key custody and recovery, trusted approval/revocation and real production recovery
remain open. This change does not approve reopening a recovered system, account
restoration, privacy policy, device acceptance or Stage 33 PASS.
