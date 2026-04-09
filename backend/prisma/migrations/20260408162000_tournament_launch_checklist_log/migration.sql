ALTER TABLE "Tournament"
ADD COLUMN "launchChecklistCompletedAt" TIMESTAMP(3),
ADD COLUMN "launchChecklistCompletedByUserId" TEXT;

CREATE INDEX "Tournament_tenantId_launchChecklistCompletedAt_idx"
ON "Tournament"("tenantId", "launchChecklistCompletedAt");

ALTER TABLE "Tournament"
ADD CONSTRAINT "Tournament_launchChecklistCompletedByUserId_fkey"
FOREIGN KEY ("launchChecklistCompletedByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
