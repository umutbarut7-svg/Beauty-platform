CREATE TABLE "BusinessCustomer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "userCustomerId" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "birthDate" DATE,
  "gender" TEXT,
  "notes" TEXT,
  "source" TEXT,
  "archivedAt" TIMESTAMP(3),
  "mergedIntoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessCustomer_business_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  CONSTRAINT "BusinessCustomer_userCustomer_fkey" FOREIGN KEY ("userCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL,
  CONSTRAINT "BusinessCustomer_mergedInto_fkey" FOREIGN KEY ("businessId", "mergedIntoId") REFERENCES "BusinessCustomer"("businessId", "id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "BusinessCustomer_businessId_phone_key" ON "BusinessCustomer"("businessId", "phone");
CREATE UNIQUE INDEX "BusinessCustomer_businessId_email_key" ON "BusinessCustomer"("businessId", "email");
CREATE INDEX "BusinessCustomer_business_name_idx" ON "BusinessCustomer"("businessId", "lastName", "firstName");
CREATE INDEX "BusinessCustomer_business_created_idx" ON "BusinessCustomer"("businessId", "createdAt");
CREATE INDEX "BusinessCustomer_userCustomer_idx" ON "BusinessCustomer"("userCustomerId");

ALTER TABLE "BusinessCustomer" ADD CONSTRAINT "BusinessCustomer_businessId_id_key" UNIQUE ("businessId", "id");

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_business_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  CONSTRAINT "CustomerNote_customer_fkey" FOREIGN KEY ("businessId", "customerId") REFERENCES "BusinessCustomer"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "CustomerNote_author_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "CustomerNote_business_customer_created_idx" ON "CustomerNote"("businessId", "customerId", "createdAt");
CREATE INDEX "CustomerNote_author_idx" ON "CustomerNote"("authorUserId");

ALTER TABLE "Appointment" ADD COLUMN "businessCustomerId" TEXT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_businessCustomer_fkey"
  FOREIGN KEY ("businessId", "businessCustomerId") REFERENCES "BusinessCustomer"("businessId", "id") ON DELETE SET NULL;
CREATE INDEX "Appointment_business_businessCustomer_start_idx" ON "Appointment"("businessId", "businessCustomerId", "startsAt");
