-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('UNIT', 'ML', 'G');

-- CreateEnum
CREATE TYPE "InventoryDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "unit" "InventoryUnit" NOT NULL,
    "stockQuantity" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOperation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "direction" "InventoryDirection" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "quantityAfter" DECIMAL(15,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogProduct_businessId_isPublic_isActive_idx" ON "CatalogProduct"("businessId", "isPublic", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_businessId_sku_key" ON "CatalogProduct"("businessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogProduct_businessId_id_key" ON "CatalogProduct"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOperation_businessId_keyHash_key" ON "InventoryOperation"("businessId", "keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOperation_businessId_id_key" ON "InventoryOperation"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_operationId_key" ON "InventoryMovement"("operationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_productId_createdAt_idx" ON "InventoryMovement"("businessId", "productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_businessId_operationId_key" ON "InventoryMovement"("businessId", "operationId");

-- AddForeignKey
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_productId_fkey" FOREIGN KEY ("businessId", "productId") REFERENCES "CatalogProduct"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_operationId_fkey" FOREIGN KEY ("businessId", "operationId") REFERENCES "InventoryOperation"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain checks remain authoritative when concurrent requests or direct SQL are used.
ALTER TABLE "CatalogProduct" ADD CONSTRAINT "CatalogProduct_values_check" CHECK (
  "price" >= 0 AND "stockQuantity" >= 0 AND "lowStockThreshold" >= 0 AND "revision" >= 0
  AND length(trim("name")) BETWEEN 1 AND 120
  AND "sku" ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'
  AND "currency" ~ '^[A-Z]{3}$'
  AND ("unit" <> 'UNIT' OR ("stockQuantity" = trunc("stockQuantity") AND "lowStockThreshold" = trunc("lowStockThreshold")))
);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_values_check" CHECK (
  "quantity" > 0 AND "quantityAfter" >= 0 AND length(trim("reason")) BETWEEN 1 AND 200
);
ALTER TABLE "InventoryOperation" ADD CONSTRAINT "InventoryOperation_type_check" CHECK ("type" IN ('IMPORT','MOVEMENT'));
