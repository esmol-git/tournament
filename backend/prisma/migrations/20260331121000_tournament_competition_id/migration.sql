-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "competitionId" TEXT;

-- CreateIndex
CREATE INDEX "Tournament_tenantId_competitionId_idx" ON "Tournament"("tenantId", "competitionId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
