"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  PrismaClient,
  Prisma,
} = require("/application/node_modules/@prisma/client");

async function main() {
  assert.equal(process.env.PREVIEW_CI_FIXTURE, "true");
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.MVP_AI_ENABLED, "false");
  assert.equal(process.env.MVP_SEMANTIC_ENABLED, "false");
  assert.equal(process.env.MVP_S3_ENABLED, "false");
  const expected = ["matchingOutput", "matchingRequestId", "matchingStatus"];
  const model = Prisma.dmmf.datamodel.models.find(
    (item) => item.name === "MvpPhotoAnalysis",
  );
  assert(model);
  const fields = model.fields.filter((field) => expected.includes(field.name));
  assert.deepEqual(fields.map((field) => field.name).sort(), expected);
  assert(fields.every((field) => !field.isRequired));
  const modules = {};
  for (const stem of [
    "mvp.module",
    "visual.service",
    "visual.controller",
    "visual.dto",
    "semantic.service",
    "visual-matches.service",
    "visual-service-compatibility",
    "photo-maintenance.service",
  ]) {
    const path = "/application/dist/mvp/" + stem + ".js";
    require(path);
    modules[stem] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path))
      .digest("hex");
  }
  const {
    resolveVisualServiceKind,
    compatibleVisualService,
  } = require("/application/dist/mvp/visual-service-compatibility.js");
  assert.equal(
    resolveVisualServiceKind("saç kesimi", "kaynak", "saç kesimi"),
    null,
  );
  assert.equal(
    resolveVisualServiceKind("saç kesimi", "kolay saç", "saç kesimi"),
    "CUT",
  );
  assert.equal(compatibleVisualService("CUT", "Kaynak"), false);
  assert.equal(compatibleVisualService("CUT", "Saç kesimi"), true);
  assert.equal(compatibleVisualService("CUT", "Kesim ve boya"), false);
  assert.equal(compatibleVisualService("EXTENSIONS", "Kirpik kaynak"), false);
  const matching = require("/application/dist/mvp/visual-matches.service.js");
  const dto = require("/application/dist/mvp/visual.dto.js");
  const { validateSync } = require("/application/node_modules/class-validator");
  assert.equal(
    typeof matching.VisualMatchesService.prototype.refresh,
    "function",
  );
  const valid = Object.assign(new dto.RefreshVisualMatchesDto(), {
    expectedRevision: "a".repeat(64),
    requestId: "synthetic-refresh-request",
  });
  assert.equal(validateSync(valid).length, 0);
  const invalid = Object.assign(new dto.RefreshVisualMatchesDto(), {
    expectedRevision: "invalid",
    requestId: "short",
  });
  assert(validateSync(invalid).length >= 2);
  // The bootstrap owns the disposable connection string; never copy runtime secrets.
  const db = new PrismaClient({
    datasourceUrl:
      "postgresql://beauty:disposable-ci-only-password@postgres:5432/beauty_preview?schema=public",
  });
  try {
    const columns = await db.$queryRawUnsafe(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='MvpPhotoAnalysis' AND column_name IN ('matchingStatus','matchingRequestId','matchingOutput') ORDER BY column_name",
    );
    assert.deepEqual(
      columns.map((row) => row.column_name),
      expected,
    );
    assert.deepEqual(
      await db.mvpPhotoAnalysis.findMany({
        take: 1,
        select: {
          matchingStatus: true,
          matchingRequestId: true,
          matchingOutput: true,
        },
      }),
      [],
    );
    const migrations = await db.$queryRawUnsafe(
      "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name='20261030000000_visual_matching_recovery' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    assert.equal(migrations.length, 1);
  } finally {
    await db.$disconnect();
  }
  console.log(
    JSON.stringify({
      source: "f712d06427092211d11c28d862365283d79f26e1",
      prismaVersion: Prisma.prismaVersion.client,
      matchingFields: expected,
      modules,
      isolatedDatabase: "PASS",
      compiledCompatibilityAssertions: 6,
      compiledRefreshAssertions: 3,
    }),
  );
}
main().catch(() => {
  console.error(
    "Isolated release image verification failed; raw diagnostics withheld",
  );
  process.exitCode = 1;
});
