/** Phone-local owner session. Never sends requests or stores private input. */
export const OWNER_CONTEXT = {
  applicationSha: "2e56def282c97a804a2f3d6c9b36a53b42a09df5",
  backupId: "orzell-database-20261112",
  backupCreatedNotBefore: "2026-11-12T00:00:02Z",
  backupCreatedNotAfter: "2026-11-12T00:00:07Z",
  recipientCertificateSha256:
    "241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c",
  signingPublicKeySha256:
    "1c99e1da54a5e4a303c98f42fddb15c8d924320a6ef772bbf15c61cebc22f13f",
  schemaReferenceSha256:
    "68362cdf1f55954652b3a3bd4df03c91ec92c99c6770e4fac41058b73e9ec71d",
  snapshotBoundary: "LIVE_DAILY_SNAPSHOT",
};

/** Extract only public challenge fields copied from the owner's AWS output.
 * Terminal prefixes and a cut-off trailing status are harmless; duplicate
 * fields, missing quotes and invalid values are rejected. Cryptographic review
 * still checks the separately authenticated AWS pin and fixed snapshot.
 */
export function parseOwnerReceipt(text) {
  if (typeof text !== "string" || text.length > 20000)
    throw new Error("PUBLIC_RECEIPT_LIMIT");
  const field = (name, pattern) => {
    const labels = [...text.matchAll(new RegExp('"' + name + '"\\s*:', "g"))];
    const values = [
      ...text.matchAll(
        new RegExp('"' + name + '"\\s*:\\s*"(' + pattern + ')"', "g"),
      ),
    ];
    if (labels.length !== 1 || values.length !== 1)
      throw new Error("ONE_PUBLIC_AWS_RECEIPT_REQUIRED");
    return values[0][1];
  };
  return {
    encoded: field("challengeBase64", "[A-Za-z0-9+/=\\s]{1,15000}").replace(
      /\s/g,
      "",
    ),
    pin: field("challengeSha256", "[0-9a-f]{64}"),
  };
}

export async function reviewOwnerChallenge(encoded, pin) {
  if (
    typeof encoded !== "string" ||
    encoded.length > 11000 ||
    !/^[A-Za-z0-9+/=]+$/.test(encoded)
  )
    throw new Error("CHALLENGE_BASE64_REQUIRED");
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (base64(bytes) !== encoded) throw new Error("CHALLENGE_BASE64_REQUIRED");
  const reviewed = await reviewHandoffChallenge(bytes, pin);
  for (const [name, value] of Object.entries(OWNER_CONTEXT))
    if (reviewed.request.context[name] !== value)
      throw new Error("APPROVED_SNAPSHOT_REQUIRED");
  return reviewed;
}

export function extractPrivatePem(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > 32768)
    throw new Error("KEY_FILE_LIMIT");
  const blocks = [
    ...text.matchAll(
      /-----BEGIN ((?:ENCRYPTED |RSA )?PRIVATE KEY)-----\r?\n[\s\S]*?-----END \1-----/g,
    ),
  ];
  if (
    blocks.length !== 1 ||
    (text.match(/-----BEGIN [^-]*PRIVATE KEY-----/g) || []).length !== 1
  )
    throw new Error("ONE_PRIVATE_PEM_REQUIRED");
  const bytes = new TextEncoder().encode(blocks[0][0] + "\n");
  if (bytes.length > 16384) throw new Error("PRIVATE_PEM_LIMIT");
  return bytes;
}

export function frameCapsule(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > 40000
  )
    throw new Error("CAPSULE_LIMIT");
  return (
    "ORZELL-CAPSULE-V1\n" +
    base64(bytes)
      .match(/.{1,256}/g)
      .join("\n") +
    "\nEND-ORZELL-CAPSULE\n"
  );
}
