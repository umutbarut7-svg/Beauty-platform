ALTER TABLE "AccountDeletionRequest" DROP CONSTRAINT "AccountDeletionRequest_userId_fkey";
ALTER TABLE "AccountDeletionRequest" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "AccountDeletionRequest" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "receiptTokenHash" TEXT;
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "restoreQuarantinedAt" TIMESTAMP(3);
