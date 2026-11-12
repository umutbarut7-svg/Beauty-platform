/** Offline Web Crypto primitive. No UI, network, file input, storage or activation. */
const KIND = "ORZELL_RECOVERY_KEY_HANDOFF";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_KEY = 16384;
const MAX_PASSWORD = 1024;
const MAX_PAYLOAD = 24576;
const CONTEXT = [
  "applicationSha",
  "backupCreatedNotAfter",
  "backupCreatedNotBefore",
  "backupId",
  "cipherSha256",
  "recipientCertificateSha256",
  "schemaReferenceSha256",
  "signingPublicKeySha256",
  "snapshotBoundary",
];

function fail(reason) {
  throw new Error(reason);
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(",")}}`;
}

function exactFields(value, fields) {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  return Object.keys(value).sort().join("|") === [...fields].sort().join("|");
}

function base64(value) {
  let text = "";
  for (let i = 0; i < value.length; i += 4096) {
    text += String.fromCharCode(...value.subarray(i, i + 4096));
  }
  return btoa(text);
}

function decode64(value) {
  if (typeof value !== "string" || value.length > 2048)
    fail("HANDOFF_SPKI_REQUIRED");
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    if (base64(bytes) !== value) fail("HANDOFF_SPKI_REQUIRED");
    return bytes;
  } catch {
    fail("HANDOFF_SPKI_REQUIRED");
  }
}

function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)
  ) {
    fail("HANDOFF_TIMESTAMP_REQUIRED");
  }
  const parsed = Date.parse(value);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value.replace("Z", ".000Z")
  ) {
    fail("HANDOFF_TIMESTAMP_REQUIRED");
  }
  return parsed;
}

/** Pin comes through a separately authenticated owner channel, never the challenge file. */
export async function reviewHandoffChallenge(
  challengeBytes,
  expectedChallengeSha256,
) {
  if (
    !(challengeBytes instanceof Uint8Array) ||
    !challengeBytes.length ||
    challengeBytes.length > 8192
  ) {
    fail("HANDOFF_CHALLENGE_LIMIT");
  }
  if (
    typeof expectedChallengeSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(expectedChallengeSha256)
  ) {
    fail("INDEPENDENT_HANDOFF_PIN_REQUIRED");
  }
  const challenge = new Uint8Array(challengeBytes);
  const label = new Uint8Array(
    await crypto.subtle.digest("SHA-256", challenge),
  );
  const observed = [...label]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  if (observed !== expectedChallengeSha256)
    fail("HANDOFF_CHALLENGE_PIN_MISMATCH");
  let request;
  try {
    request = JSON.parse(decoder.decode(challenge));
    if (canonical(request) !== decoder.decode(challenge))
      fail("HANDOFF_CANONICAL_JSON_REQUIRED");
  } catch {
    fail("HANDOFF_CANONICAL_JSON_REQUIRED");
  }
  if (
    !exactFields(request, [
      "version",
      "kind",
      "handoffId",
      "createdAt",
      "expiresAt",
      "wrapPublicKeySpki",
      "context",
    ]) ||
    request.version !== 1 ||
    request.kind !== KIND ||
    typeof request.handoffId !== "string" ||
    !/^[0-9a-f]{64}$/.test(request.handoffId) ||
    !exactFields(request.context, CONTEXT)
  ) {
    fail("HANDOFF_CHALLENGE_CONTEXT_REQUIRED");
  }
  const created = timestamp(request.createdAt);
  const expires = timestamp(request.expiresAt);
  if (!(
    created <= Date.now() &&
    Date.now() < expires &&
    expires - created <= 600000 &&
    expires > created
  )) {
    fail("HANDOFF_EXPIRED_OR_INVALID_LIFETIME");
  }
  for (const name of CONTEXT) {
    const value = request.context[name];
    if (name === "backupCreatedNotBefore" || name === "backupCreatedNotAfter")
      continue;
    const pattern =
      name === "backupId" || name === "snapshotBoundary"
        ? /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
        : name === "applicationSha"
          ? /^[0-9a-f]{40}$/
          : /^[0-9a-f]{64}$/;
    if (typeof value !== "string" || !pattern.test(value))
      fail("HANDOFF_CHALLENGE_CONTEXT_REQUIRED");
  }
  const before = timestamp(request.context.backupCreatedNotBefore);
  const after = timestamp(request.context.backupCreatedNotAfter);
  if (!(before <= after && after <= Date.now()))
    fail("HANDOFF_BACKUP_WINDOW_REQUIRED");
  const publicKey = await crypto.subtle.importKey(
    "spki",
    decode64(request.wrapPublicKeySpki),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  if (publicKey.algorithm.modulusLength !== 3072)
    fail("HANDOFF_RSA_PROFILE_REQUIRED");
  return { challenge, request, publicKey, label, observed, expires };
}

export async function wrapRecoveryKey(
  challengeBytes,
  expectedChallengeSha256,
  privateKeyBytes,
  passphraseBytes = null,
) {
  const { challenge, publicKey, label, observed, expires } =
    await reviewHandoffChallenge(challengeBytes, expectedChallengeSha256);
  // Trust is checked before the function copies or processes private bytes.
  if (
    !(privateKeyBytes instanceof Uint8Array) ||
    !privateKeyBytes.length ||
    privateKeyBytes.length > MAX_KEY ||
    (passphraseBytes !== null &&
      (!(passphraseBytes instanceof Uint8Array) ||
        !passphraseBytes.length ||
        passphraseBytes.length > MAX_PASSWORD))
  )
    fail("HANDOFF_PRIVATE_INPUT_LIMIT");
  const keyCopy = new Uint8Array(privateKeyBytes);
  const passwordCopy =
    passphraseBytes === null ? null : new Uint8Array(passphraseBytes);
  const aesBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  let plaintext;
  try {
    plaintext = encoder.encode(
      canonical({
        privateKey: base64(keyCopy),
        passphrase: passwordCopy === null ? null : base64(passwordCopy),
      }),
    );
    if (plaintext.length > MAX_PAYLOAD) fail("HANDOFF_PRIVATE_INPUT_LIMIT");
    const aesKey = await crypto.subtle.importKey(
      "raw",
      aesBytes,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: challenge, tagLength: 128 },
        aesKey,
        plaintext,
      ),
    );
    const wrappedKey = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "RSA-OAEP", label },
        publicKey,
        aesBytes,
      ),
    );
    if (Date.now() >= expires) fail("HANDOFF_EXPIRED_OR_INVALID_LIFETIME");
    return encoder.encode(
      canonical({
        version: 1,
        kind: KIND,
        challengeSha256: observed,
        wrappedKey: base64(wrappedKey),
        iv: base64(iv),
        ciphertext: base64(ciphertext),
      }),
    );
  } finally {
    keyCopy.fill(0);
    passwordCopy?.fill(0);
    aesBytes.fill(0);
    plaintext?.fill(0);
  }
}
