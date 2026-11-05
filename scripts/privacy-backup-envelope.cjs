"use strict";
// CI fixture only. Key custody, durable storage and production recovery are separate.
const assert = require("node:assert/strict");
const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");
const MAGIC = Buffer.from("ORZELL-SYNTHETIC-BACKUP-V1\n");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

function aad(context) {
  assert.match(context.application, /^[0-9a-f]{40}$/);
  assert.ok(
    ["BEFORE_WITHDRAWAL_COMMIT", "AFTER_WITHDRAWAL_COMMIT"].includes(
      context.snapshotBoundary,
    ),
  );
  return Buffer.from(
    JSON.stringify({
      application: context.application,
      snapshotBoundary: context.snapshotBoundary,
    }),
  );
}

function sealFixture(dump, key, context) {
  assert.ok(Buffer.isBuffer(dump) && dump.length > 0);
  assert.ok(Buffer.isBuffer(key) && key.length === 32);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.concat([MAGIC, aad(context)]));
  const ciphertext = Buffer.concat([cipher.update(dump), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}

function openFixture(envelope, key, context) {
  assert.ok(Buffer.isBuffer(key) && key.length === 32);
  assert.ok(
    Buffer.isBuffer(envelope) &&
      envelope.length > MAGIC.length + NONCE_BYTES + TAG_BYTES,
  );
  assert.ok(envelope.subarray(0, MAGIC.length).equals(MAGIC));
  const nonceEnd = MAGIC.length + NONCE_BYTES;
  const tagEnd = nonceEnd + TAG_BYTES;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    envelope.subarray(MAGIC.length, nonceEnd),
  );
  decipher.setAAD(Buffer.concat([MAGIC, aad(context)]));
  decipher.setAuthTag(envelope.subarray(nonceEnd, tagEnd));
  // Never expose unauthenticated plaintext to the caller or pg_restore.
  const pending = decipher.update(envelope.subarray(tagEnd));
  try {
    return Buffer.concat([pending, decipher.final()]);
  } finally {
    pending.fill(0);
  }
}

module.exports = { sealFixture, openFixture };
