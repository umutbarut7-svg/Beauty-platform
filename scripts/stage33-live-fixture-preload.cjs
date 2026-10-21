"use strict";
const assert = require("node:assert/strict");
assert.equal(process.env.STAGE33_LIVE_JOURNEY_TEST, "confirmed");
assert.equal(
  process.env.DATABASE_URL,
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_platform_live_ci?schema=public",
);
// Fixture-only UUID namespace preserves 112 random bits and the production key
// format, while keeping all generated objects inside the existing IAM test prefix.
const crypto = require("node:crypto");
const originalUUID = crypto.randomUUID;
crypto.randomUUID = () => `f33f33f3-${originalUUID().slice(9)}`;
if (process.env.STAGE33_TEST_FAIL_ERASE_ONCE === "confirmed") {
  require("reflect-metadata");
  const {
    PrivatePhotoStore,
  } = require("./dist/mvp/providers/private-photo-store.js");
  const erase = PrivatePhotoStore.prototype.erase;
  let failed = false;
  PrivatePhotoStore.prototype.erase = async function (key) {
    if (!failed) {
      failed = true;
      throw new Error("SyntheticFirstErasureFailure");
    }
    return erase.call(this, key);
  };
}
