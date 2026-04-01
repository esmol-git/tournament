-- CreateTable
CREATE TABLE "AgeGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortLabel" TEXT,
    "code" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgeGroup_tenantId_sortOrder_idx" ON "AgeGroup"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "AgeGroup_tenantId_name_idx" ON "AgeGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Region_tenantId_sortOrder_idx" ON "Region"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Region_tenantId_name_idx" ON "Region"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "AgeGroup" ADD CONSTRAINT "AgeGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "ageGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Tournament_tenantId_ageGroupId_idx" ON "Tournament"("tenantId", "ageGroupId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "ageGroupId" TEXT;
ALTER TABLE "Team" ADD COLUMN "regionId" TEXT;

-- CreateIndex
CREATE INDEX "Team_tenantId_ageGroupId_idx" ON "Team"("tenantId", "ageGroupId");
CREATE INDEX "Team_tenantId_regionId_idx" ON "Team"("tenantId", "regionId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Stadium" ADD COLUMN "regionId" TEXT;

-- CreateIndex
CREATE INDEX "Stadium_tenantId_regionId_idx" ON "Stadium"("tenantId", "regionId");

-- AddForeignKey
ALTER TABLE "Stadium" ADD CONSTRAINT "Stadium_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
