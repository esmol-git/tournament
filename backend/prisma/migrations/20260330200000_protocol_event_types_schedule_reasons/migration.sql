-- CreateEnum
CREATE TYPE "MatchScheduleReasonScope" AS ENUM ('POSTPONE', 'CANCEL', 'BOTH');

-- CreateTable
CREATE TABLE "ProtocolEventType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mapsToType" "MatchEventType" NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtocolEventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchScheduleReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "scope" "MatchScheduleReasonScope" NOT NULL DEFAULT 'BOTH',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchScheduleReason_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "scheduleChangeReasonId" TEXT,
ADD COLUMN     "scheduleChangeNote" TEXT;

-- AlterTable
ALTER TABLE "MatchEvent" ADD COLUMN     "protocolEventTypeId" TEXT;

-- CreateIndex
CREATE INDEX "ProtocolEventType_tenantId_sortOrder_idx" ON "ProtocolEventType"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProtocolEventType_tenantId_name_idx" ON "ProtocolEventType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "MatchScheduleReason_tenantId_sortOrder_idx" ON "MatchScheduleReason"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "MatchScheduleReason_tenantId_name_idx" ON "MatchScheduleReason"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Match_scheduleChangeReasonId_idx" ON "Match"("scheduleChangeReasonId");

-- CreateIndex
CREATE INDEX "MatchEvent_protocolEventTypeId_idx" ON "MatchEvent"("protocolEventTypeId");

-- AddForeignKey
ALTER TABLE "ProtocolEventType" ADD CONSTRAINT "ProtocolEventType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchScheduleReason" ADD CONSTRAINT "MatchScheduleReason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_scheduleChangeReasonId_fkey" FOREIGN KEY ("scheduleChangeReasonId") REFERENCES "MatchScheduleReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_protocolEventTypeId_fkey" FOREIGN KEY ("protocolEventTypeId") REFERENCES "ProtocolEventType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
