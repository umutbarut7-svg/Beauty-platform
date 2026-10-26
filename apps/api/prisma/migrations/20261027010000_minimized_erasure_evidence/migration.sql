CREATE TABLE "AccountDeletionEvidence" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "policyVersion" TEXT,
  "noticeHash" TEXT,
  "action" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountDeletionEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountDeletionEvidence_requestId_kind_sourceHash_key" ON "AccountDeletionEvidence"("requestId", "kind", "sourceHash");
CREATE INDEX "AccountDeletionEvidence_expiresAt_idx" ON "AccountDeletionEvidence"("expiresAt");
ALTER TABLE "AccountDeletionEvidence" ADD CONSTRAINT "AccountDeletionEvidence_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountDeletionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
