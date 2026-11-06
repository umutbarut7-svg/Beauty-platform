"use strict";
// Isolated fixture adapter only; the production worker/maintenance/SQL code is unchanged.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
assert.equal(process.env.PRIVACY_LOOP_FIXTURE, "confirmed");
assert.equal(process.env.NODE_ENV, "test");
assert.equal(
  process.env.DATABASE_URL,
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_privacy_loop_ci?schema=public",
);
assert.equal(process.env.MVP_S3_ENABLED, "false");
assert.equal(process.env.MVP_AI_ENABLED, "false");
const root = path.resolve(process.env.PRIVACY_LOOP_ROOT);
assert.ok(root.startsWith(path.resolve(process.env.RUNNER_TEMP) + path.sep));
require("reflect-metadata");
const {
  PrivatePhotoStore,
} = require("./dist/mvp/providers/private-photo-store.js");
const {
  PhotoMaintenanceService,
} = require("./dist/mvp/photo-maintenance.service.js");
PrivatePhotoStore.prototype.erase = async function (key) {
  assert.match(key, /^private\/mvp\/f33f33f3-[0-9a-f-]{27}$/);
  fs.appendFileSync(path.join(root, "attempts"), "attempt\n");
  if (fs.existsSync(path.join(root, "blocked")))
    throw new Error("SyntheticStorageBlocked");
  fs.rmSync(path.join(root, key.slice("private/mvp/".length)), { force: true });
};
const sweep = PhotoMaintenanceService.prototype.sweep;
PhotoMaintenanceService.prototype.sweep = async function () {
  const result = await sweep.call(this);
  fs.appendFileSync(path.join(root, "sweeps"), "completed\n");
  return result;
};
