-- AlterTable
ALTER TABLE "Team" ADD COLUMN "teamCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "Team_tenantId_teamCategoryId_idx" ON "Team"("tenantId", "teamCategoryId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_teamCategoryId_fkey" FOREIGN KEY ("teamCategoryId") REFERENCES "TeamCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
