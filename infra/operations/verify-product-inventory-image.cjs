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
  for (const flag of [
    "MVP_AI_ENABLED",
    "MVP_SEMANTIC_ENABLED",
    "MVP_S3_ENABLED",
    "MVP_INVENTORY_ENABLED",
  ])
    assert.equal(process.env[flag], "false");
  const models = ["CatalogProduct", "InventoryMovement", "InventoryOperation"];
  for (const name of models)
    assert(Prisma.dmmf.datamodel.models.some((m) => m.name === name));
  const modules = {};
  for (const stem of [
    "app.module",
    "auth/permissions.service",
    "database/prisma.service",
    "mvp/mvp.service",
    "inventory/inventory-policy",
    "inventory/inventory.module",
    "inventory/inventory.controller",
    "inventory/inventory.dto",
    "inventory/inventory.service",
    "mvp/visual.service",
    "mvp/visual-matches.service",
    "mvp/photo-maintenance.service",
  ]) {
    const path = `/application/dist/${stem}.js`;
    require(path);
    modules[stem] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path))
      .digest("hex");
  }
  const db = new PrismaClient({
    datasourceUrl:
      "postgresql://beauty:disposable-ci-only-password@postgres:5432/beauty_preview?schema=public",
  });
  const {
    InventoryService,
  } = require("/application/dist/inventory/inventory.service.js");
  const {
    PermissionsService,
  } = require("/application/dist/auth/permissions.service.js");
  const service = new InventoryService(db, new PermissionsService(db));
  const user = {
    id: "inventory-release-fixture-owner",
    email: "inventory-release@example.test",
    role: "BUSINESS_OWNER",
  };
  const businessId = "inventory-release-fixture-business";
  try {
    const migration = await db.$queryRawUnsafe(
      "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name='20261104000000_product_inventory' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    assert.equal(migration.length, 1);
    await assert.rejects(
      service.list(user, businessId),
      (e) => e.getStatus() === 503,
    );
    await db.user.create({
      data: {
        id: user.id,
        email: user.email,
        passwordHash: "synthetic-unused-no-login",
        role: "BUSINESS_OWNER",
      },
    });
    await db.business.create({
      data: {
        id: businessId,
        name: "Synthetic inventory release",
        slug: "synthetic-inventory-release",
        memberships: { create: { userId: user.id, role: "BUSINESS_OWNER" } },
      },
    });
    process.env.MVP_INVENTORY_ENABLED = "true";
    const payload = {
      idempotencyKey: "inventory-release-import-1",
      products: [
        {
          sku: "SYNTHETIC-A",
          name: "Synthetic inventory item",
          price: "2000.50",
          currency: "TRY",
          unit: "UNIT",
          lowStockThreshold: "2",
        },
      ],
    };
    const imported = await service.importProducts(user, businessId, payload);
    assert.deepEqual(
      await service.importProducts(user, businessId, payload),
      imported,
    );
    const productId = imported.ids[0];
    const movement = {
      idempotencyKey: "inventory-release-stock-1",
      direction: "IN",
      quantity: "3",
      reason: "Synthetic opening count",
    };
    const receipt = await service.move(user, businessId, productId, movement);
    assert.deepEqual(
      await service.move(user, businessId, productId, movement),
      receipt,
    );
    assert.equal(receipt.quantityAfter, "3");
    await assert.rejects(
      service.move(user, businessId, productId, {
        ...movement,
        idempotencyKey: "inventory-release-stock-2",
        direction: "OUT",
        quantity: "4",
      }),
      (e) => e.getStatus() === 409,
    );
    await assert.rejects(
      db.catalogProduct.update({
        where: { id: productId },
        data: { stockQuantity: -1 },
      }),
    );
    assert.equal(
      (
        await db.catalogProduct.findUniqueOrThrow({ where: { id: productId } })
      ).stockQuantity.toString(),
      "3",
    );
    await assert.rejects(
      service.publicCatalog(businessId),
      (e) => e.getStatus() === 404,
    );
    await db.business.update({
      where: { id: businessId },
      data: { isPublic: true },
    });
    assert.equal((await service.publicCatalog(businessId)).items.length, 0);
    const product = await db.catalogProduct.findUniqueOrThrow({
      where: { id: productId },
    });
    await service.update(user, businessId, productId, {
      expectedRevision: product.revision,
      isPublic: true,
    });
    const publicProduct = (await service.publicCatalog(businessId)).items[0];
    assert.equal(publicProduct.availability, "IN_STOCK");
    assert.equal("stockQuantity" in publicProduct, false);
    assert.equal(
      await db.inventoryMovement.count({ where: { businessId } }),
      1,
    );
  } finally {
    process.env.MVP_INVENTORY_ENABLED = "false";
    await db.inventoryMovement.deleteMany({ where: { businessId } });
    await db.inventoryOperation.deleteMany({ where: { businessId } });
    await db.catalogProduct.deleteMany({ where: { businessId } });
    await db.businessMember.deleteMany({ where: { businessId } });
    await db.business.deleteMany({ where: { id: businessId } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  }
  console.log(
    JSON.stringify({
      source: "113abadd7f2776953baf9c3e89046b08388bf647",
      prismaVersion: Prisma.prismaVersion.client,
      models,
      modules,
      isolatedDatabase: "PASS",
      compiledInventoryAssertions: 10,
      providerRequests: 0,
      liveDeployment: false,
    }),
  );
}
main().catch(() => {
  console.error(
    "Isolated product inventory rehearsal failed; private diagnostics withheld",
  );
  process.exitCode = 1;
});
