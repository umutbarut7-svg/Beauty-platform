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
    "MVP_B2B_ENABLED",
  ])
    assert.equal(process.env[flag], "false");
  const models = [
    "CatalogProduct",
    "InventoryMovement",
    "InventoryOperation",
    "SupplierProfile",
    "B2BQuoteRequest",
  ];
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
    "b2b/b2b.module",
    "b2b/b2b.controller",
    "b2b/b2b.dto",
    "b2b/b2b.service",
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
  const supplierId = "inventory-release-fixture-supplier";
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
    const { B2BService } = require("/application/dist/b2b/b2b.service.js");
    const bridge = new B2BService(db, new PermissionsService(db));
    await assert.rejects(
      bridge.profile(user, businessId),
      (e) => e.getStatus() === 503,
    );
    const b2bMigration = await db.$queryRawUnsafe(
      "SELECT migration_name FROM \"_prisma_migrations\" WHERE migration_name='20261104010000_b2b_supplier_bridge' AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    assert.equal(b2bMigration.length, 1);
    await db.business.create({
      data: {
        id: supplierId,
        name: "Synthetic supplier release",
        slug: "synthetic-supplier-release",
        isPublic: true,
        memberships: { create: { userId: user.id, role: "BUSINESS_OWNER" } },
      },
    });
    process.env.MVP_B2B_ENABLED = "true";
    await bridge.saveProfile(user, supplierId, {
      kind: "MANUFACTURER",
      description: "Synthetic supplier only",
      isListed: true,
    });
    const vendorProduct = (
      await service.importProducts(user, supplierId, payload)
    ).ids[0];
    await service.update(user, supplierId, vendorProduct, {
      expectedRevision: 0,
      b2bAvailable: true,
    });
    const productPage = await bridge.products(user, businessId, supplierId, {});
    assert.equal(productPage.items.length, 1);
    assert.equal("stockQuantity" in productPage.items[0], false);
    const demand = {
      supplierBusinessId: supplierId,
      productId: vendorProduct,
      quantity: "2",
      note: "Synthetic quote",
      idempotencyKey: "combined-b2b-quote-1",
    };
    const requested = await bridge.requestQuote(user, businessId, demand);
    assert.deepEqual(
      await bridge.requestQuote(user, businessId, demand),
      requested,
    );
    await bridge.reply(user, supplierId, requested.id, {
      expectedRevision: 0,
      action: "QUOTE",
      unitPrice: "10.50",
      currency: "TRY",
      note: "Synthetic reply",
    });
    const quoted = (await bridge.quotes(user, businessId, { side: "BUYER" }))
      .items[0];
    assert.equal(quoted.status, "QUOTED");
    assert.equal(quoted.quotedUnitPrice.toString(), "10.5");
    await bridge.cancel(user, businessId, requested.id, 1);
    assert.equal(
      (await bridge.quotes(user, businessId, { side: "BUYER" })).items[0]
        .status,
      "CANCELLED",
    );
    assert.equal(
      await db.inventoryMovement.count({ where: { businessId: supplierId } }),
      0,
    );
  } finally {
    process.env.MVP_INVENTORY_ENABLED = "false";
    process.env.MVP_B2B_ENABLED = "false";
    await db.b2BQuoteRequest.deleteMany({
      where: { buyerBusinessId: businessId },
    });
    await db.supplierProfile.deleteMany({ where: { businessId: supplierId } });
    const businesses = { in: [businessId, supplierId] };
    await db.inventoryMovement.deleteMany({
      where: { businessId: businesses },
    });
    await db.inventoryOperation.deleteMany({
      where: { businessId: businesses },
    });
    await db.catalogProduct.deleteMany({ where: { businessId: businesses } });
    await db.businessMember.deleteMany({ where: { businessId: businesses } });
    await db.business.deleteMany({ where: { id: businesses } });
    await db.user.deleteMany({ where: { id: user.id } });
    await db.$disconnect();
  }
  console.log(
    JSON.stringify({
      source: "2e0c52f705d4ec26f161720a97914aa56965e0c2",
      prismaVersion: Prisma.prismaVersion.client,
      models,
      modules,
      isolatedDatabase: "PASS",
      compiledInventoryAssertions: 10,
      compiledB2BAssertions: 8,
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
