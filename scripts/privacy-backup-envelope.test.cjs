"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { sealFixture, openFixture } = require("./privacy-backup-envelope.cjs");
const context = {
  application: "9c487dc425d157a2a5bb1de9bc48beab63eda90c",
  snapshotBoundary: "BEFORE_WITHDRAWAL_COMMIT",
};

test("binary PostgreSQL archive survives encryption and authenticated opening", () => {
  const key = randomBytes(32);
  const dump = Buffer.concat([Buffer.from("PGDMP"), randomBytes(8192)]);
  const sealed = sealFixture(dump, key, context);
  assert.deepEqual(openFixture(sealed, key, context), dump);
  assert.ok(!sealed.includes(dump.subarray(0, 64)));
  assert.notDeepEqual(sealFixture(dump, key, context), sealed);
});

test("corruption in every envelope region fails before plaintext is returned", () => {
  const key = randomBytes(32);
  const sealed = sealFixture(randomBytes(1024), key, context);
  for (const index of [0, 25, 37, 53, sealed.length - 1]) {
    const changed = Buffer.from(sealed);
    changed[index] ^= 1;
    assert.throws(() => openFixture(changed, key, context));
  }
  for (const size of [0, 25, 53, sealed.length - 1])
    assert.throws(() => openFixture(sealed.subarray(0, size), key, context));
});

test("wrong key, source revision and snapshot boundary cannot open archive", () => {
  const key = randomBytes(32);
  const sealed = sealFixture(randomBytes(1024), key, context);
  assert.throws(() => openFixture(sealed, randomBytes(32), context));
  assert.throws(() =>
    openFixture(sealed, key, { ...context, application: "a".repeat(40) }),
  );
  assert.throws(() =>
    openFixture(sealed, key, {
      ...context,
      snapshotBoundary: "AFTER_WITHDRAWAL_COMMIT",
    }),
  );
});
