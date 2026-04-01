-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "seasonId" TEXT;

-- CreateIndex
CREATE INDEX "Tournament_tenantId_seasonId_idx" ON "Tournament"("tenantId", "seasonId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
