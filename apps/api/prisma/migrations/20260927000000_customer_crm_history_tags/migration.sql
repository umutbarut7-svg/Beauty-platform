CREATE TYPE "CustomerGender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY', 'OTHER');

ALTER TABLE "BusinessCustomer"
  ALTER COLUMN "gender" TYPE "CustomerGender" USING (
    CASE UPPER("gender")
      WHEN 'FEMALE' THEN 'FEMALE'::"CustomerGender"
      WHEN 'MALE' THEN 'MALE'::"CustomerGender"
      WHEN 'NON_BINARY' THEN 'NON_BINARY'::"CustomerGender"
      WHEN 'PREFER_NOT_TO_SAY' THEN 'PREFER_NOT_TO_SAY'::"CustomerGender"
      ELSE CASE WHEN "gender" IS NULL THEN NULL ELSE 'OTHER'::"CustomerGender" END
    END
  ),
  ADD COLUMN "preferredStaffId" TEXT,
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "smsConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessCustomer" ADD CONSTRAINT "BusinessCustomer_preferredStaff_fkey"
  FOREIGN KEY ("businessId", "preferredStaffId") REFERENCES "Staff"("businessId", "id") ON DELETE SET NULL;
CREATE INDEX "BusinessCustomer_business_preferredStaff_idx" ON "BusinessCustomer"("businessId", "preferredStaffId");

CREATE TABLE "CustomerTag" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerTag_business_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CustomerTag_businessId_id_key" ON "CustomerTag"("businessId", "id");
CREATE UNIQUE INDEX "CustomerTag_businessId_slug_key" ON "CustomerTag"("businessId", "slug");
CREATE INDEX "CustomerTag_business_name_idx" ON "CustomerTag"("businessId", "name");

CREATE TABLE "CustomerTagAssignment" (
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerTagAssignment_pkey" PRIMARY KEY ("customerId", "tagId"),
  CONSTRAINT "CustomerTagAssignment_customer_fkey" FOREIGN KEY ("businessId", "customerId") REFERENCES "BusinessCustomer"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "CustomerTagAssignment_tag_fkey" FOREIGN KEY ("businessId", "tagId") REFERENCES "CustomerTag"("businessId", "id") ON DELETE CASCADE
);
CREATE INDEX "CustomerTagAssignment_business_tag_customer_idx" ON "CustomerTagAssignment"("businessId", "tagId", "customerId");
