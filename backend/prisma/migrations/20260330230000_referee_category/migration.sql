-- CreateTable
CREATE TABLE "RefereeCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefereeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefereeCategory_tenantId_sortOrder_idx" ON "RefereeCategory"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "RefereeCategory_tenantId_name_idx" ON "RefereeCategory"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "RefereeCategory" ADD CONSTRAINT "RefereeCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Referee" ADD COLUMN "refereeCategoryId" TEXT;

-- CreateIndex
CREATE INDEX "Referee_tenantId_refereeCategoryId_idx" ON "Referee"("tenantId", "refereeCategoryId");

-- AddForeignKey
ALTER TABLE "Referee" ADD CONSTRAINT "Referee_refereeCategoryId_fkey" FOREIGN KEY ("refereeCategoryId") REFERENCES "RefereeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
