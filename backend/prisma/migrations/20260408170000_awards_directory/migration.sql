-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Award_tenantId_sortOrder_idx" ON "Award"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Award_tenantId_name_idx" ON "Award"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
