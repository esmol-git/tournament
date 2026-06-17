-- CreateEnum
CREATE TYPE "CompetitionAudience" AS ENUM ('YOUTH', 'ADULT_AMATEUR', 'ADULT_COMPETITIVE', 'OPEN');

-- CreateEnum
CREATE TYPE "SanctionScope" AS ENUM ('TOURNAMENT', 'EDITION');

-- CreateEnum
CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TournamentRegulationMode" AS ENUM ('INHERIT', 'OVERRIDE');

-- CreateTable
CREATE TABLE "CompetitionEdition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "seasonId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "audience" "CompetitionAudience" NOT NULL DEFAULT 'OPEN',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sanctionScope" "SanctionScope" NOT NULL DEFAULT 'EDITION',
    "cardAutoBanEnabled" BOOLEAN NOT NULL DEFAULT false,
    "redCardBanMatches" INTEGER NOT NULL DEFAULT 1,
    "yellowAccumulationThreshold" INTEGER NOT NULL DEFAULT 2,
    "yellowAccumulationBanMatches" INTEGER NOT NULL DEFAULT 1,
    "technicalWinGoalsFor" INTEGER NOT NULL DEFAULT 3,
    "technicalWinGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "status" "EditionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEdition_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "editionId" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "regulationMode" "TournamentRegulationMode" NOT NULL DEFAULT 'INHERIT';

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEdition_tenantId_slug_key" ON "CompetitionEdition"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "CompetitionEdition_tenantId_seasonId_idx" ON "CompetitionEdition"("tenantId", "seasonId");

-- CreateIndex
CREATE INDEX "CompetitionEdition_tenantId_competitionId_idx" ON "CompetitionEdition"("tenantId", "competitionId");

-- CreateIndex
CREATE INDEX "CompetitionEdition_tenantId_status_idx" ON "CompetitionEdition"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Tournament_tenantId_editionId_idx" ON "Tournament"("tenantId", "editionId");

-- AddForeignKey
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "CompetitionEdition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
