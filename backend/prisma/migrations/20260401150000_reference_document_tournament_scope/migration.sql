-- Hybrid scope for reference documents:
-- - tournamentId IS NULL  -> tenant-wide document
-- - tournamentId IS NOT NULL -> document bound to a specific tournament

ALTER TABLE "ReferenceDocument"
ADD COLUMN "tournamentId" TEXT;

ALTER TABLE "ReferenceDocument"
ADD CONSTRAINT "ReferenceDocument_tournamentId_fkey"
FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ReferenceDocument_tenantId_tournamentId_sortOrder_idx"
ON "ReferenceDocument"("tenantId", "tournamentId", "sortOrder");
