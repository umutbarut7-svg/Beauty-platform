-- CreateEnum
CREATE TYPE "B2BQuoteStatus" AS ENUM ('REQUESTED', 'QUOTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CatalogProduct" ADD COLUMN     "b2bAvailable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isListed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("businessId")
);

-- CreateTable
CREATE TABLE "B2BQuoteRequest" (
    "id" TEXT NOT NULL,
    "buyerBusinessId" TEXT NOT NULL,
    "supplierBusinessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "unit" "InventoryUnit" NOT NULL,
    "quantity" DECIMAL(15,3) NOT NULL,
    "buyerNote" TEXT NOT NULL,
    "supplierNote" TEXT,
    "status" "B2BQuoteStatus" NOT NULL DEFAULT 'REQUESTED',
    "quotedUnitPrice" DECIMAL(12,2),
    "currency" CHAR(3),
    "requestedBy" TEXT NOT NULL,
    "respondedBy" TEXT,
    "keyHash" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BQuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "B2BQuoteRequest_buyerBusinessId_createdAt_idx" ON "B2BQuoteRequest"("buyerBusinessId", "createdAt");

-- CreateIndex
CREATE INDEX "B2BQuoteRequest_supplierBusinessId_createdAt_idx" ON "B2BQuoteRequest"("supplierBusinessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "B2BQuoteRequest_buyerBusinessId_keyHash_key" ON "B2BQuoteRequest"("buyerBusinessId", "keyHash");

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BQuoteRequest" ADD CONSTRAINT "B2BQuoteRequest_buyerBusinessId_fkey" FOREIGN KEY ("buyerBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BQuoteRequest" ADD CONSTRAINT "B2BQuoteRequest_supplierBusinessId_fkey" FOREIGN KEY ("supplierBusinessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BQuoteRequest" ADD CONSTRAINT "B2BQuoteRequest_supplierBusinessId_productId_fkey" FOREIGN KEY ("supplierBusinessId", "productId") REFERENCES "CatalogProduct"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_values_check" CHECK (
  "kind" IN ('BRAND','MANUFACTURER','DISTRIBUTOR','WHOLESALER') AND "revision" >= 0 AND length("description") <= 2000
);
ALTER TABLE "B2BQuoteRequest" ADD CONSTRAINT "B2BQuoteRequest_values_check" CHECK (
  "buyerBusinessId" <> "supplierBusinessId" AND "quantity" > 0 AND "revision" >= 0
  AND ("unit" <> 'UNIT' OR "quantity" = trunc("quantity"))
  AND length("buyerNote") <= 1000 AND ("supplierNote" IS NULL OR length("supplierNote") <= 1000)
  AND ("quotedUnitPrice" IS NULL OR "quotedUnitPrice" >= 0)
  AND (("quotedUnitPrice" IS NULL) = ("currency" IS NULL))
  AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
  AND ("status" <> 'QUOTED' OR "quotedUnitPrice" IS NOT NULL)
  AND ("status" NOT IN ('REQUESTED','DECLINED') OR "quotedUnitPrice" IS NULL)
);
