-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "createdByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Tournament_tenantId_createdByUserId_idx" ON "Tournament"("tenantId", "createdByUserId");
