-- CreateTable
CREATE TABLE "ManagementMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagementMember_tenantId_sortOrder_idx" ON "ManagementMember"("tenantId", "sortOrder");
CREATE INDEX "ManagementMember_tenantId_lastName_firstName_idx" ON "ManagementMember"("tenantId", "lastName", "firstName");

ALTER TABLE "ManagementMember" ADD CONSTRAINT "ManagementMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
