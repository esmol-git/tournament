-- CreateTable
CREATE TABLE "RefereePosition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefereePosition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefereePosition_tenantId_sortOrder_idx" ON "RefereePosition"("tenantId", "sortOrder");
CREATE INDEX "RefereePosition_tenantId_name_idx" ON "RefereePosition"("tenantId", "name");

ALTER TABLE "RefereePosition" ADD CONSTRAINT "RefereePosition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referee" ADD COLUMN "refereePositionId" TEXT;

CREATE INDEX "Referee_tenantId_refereePositionId_idx" ON "Referee"("tenantId", "refereePositionId");

ALTER TABLE "Referee" ADD CONSTRAINT "Referee_refereePositionId_fkey" FOREIGN KEY ("refereePositionId") REFERENCES "RefereePosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
