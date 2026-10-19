CREATE TYPE "CustomerSegmentType" AS ENUM ('MANUAL', 'DYNAMIC');
CREATE TABLE "CustomerSegment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CustomerSegmentType" NOT NULL,
  "rules" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSegment_business_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CustomerSegment_businessId_id_key" ON "CustomerSegment"("businessId", "id");
CREATE UNIQUE INDEX "CustomerSegment_businessId_name_key" ON "CustomerSegment"("businessId", "name");
CREATE INDEX "CustomerSegment_business_active_created_idx" ON "CustomerSegment"("businessId", "isActive", "createdAt");

CREATE TABLE "CustomerSegmentMembership" (
  "businessId" TEXT NOT NULL,
  "segmentId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSegmentMembership_pkey" PRIMARY KEY ("segmentId", "customerId"),
  CONSTRAINT "CustomerSegmentMembership_segment_fkey" FOREIGN KEY ("businessId", "segmentId") REFERENCES "CustomerSegment"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "CustomerSegmentMembership_customer_fkey" FOREIGN KEY ("businessId", "customerId") REFERENCES "BusinessCustomer"("businessId", "id") ON DELETE CASCADE
);
CREATE INDEX "CustomerSegmentMembership_business_customer_segment_idx" ON "CustomerSegmentMembership"("businessId", "customerId", "segmentId");
