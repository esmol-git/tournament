-- CreateEnum
CREATE TYPE "DemoLeadStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "DemoLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "status" "DemoLeadStatus" NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "userAgent" TEXT,
    "referer" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "DemoLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoLead_status_createdAt_idx" ON "DemoLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DemoLead_createdAt_idx" ON "DemoLead"("createdAt");
