-- CreateEnum
CREATE TYPE "TournamentTemplateKind" AS ENUM ('FORMAT', 'OPERATIONAL', 'BRANDED');

-- CreateTable
CREATE TABLE "TournamentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TournamentTemplateKind" NOT NULL DEFAULT 'FORMAT',
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_GROUP',
    "groupCount" INTEGER NOT NULL DEFAULT 1,
    "playoffQualifiersPerGroup" INTEGER NOT NULL DEFAULT 2,
    "intervalDays" INTEGER NOT NULL DEFAULT 7,
    "allowedDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "roundRobinCycles" INTEGER NOT NULL DEFAULT 1,
    "matchDurationMinutes" INTEGER NOT NULL DEFAULT 50,
    "matchBreakMinutes" INTEGER NOT NULL DEFAULT 10,
    "simultaneousMatches" INTEGER NOT NULL DEFAULT 1,
    "dayStartTimeDefault" TEXT NOT NULL DEFAULT '12:00',
    "dayStartTimeOverrides" JSONB,
    "minTeams" INTEGER NOT NULL DEFAULT 2,
    "pointsWin" INTEGER NOT NULL DEFAULT 3,
    "pointsDraw" INTEGER NOT NULL DEFAULT 1,
    "pointsLoss" INTEGER NOT NULL DEFAULT 0,
    "calendarColor" TEXT,
    "category" TEXT,
    "seasonId" TEXT,
    "competitionId" TEXT,
    "ageGroupId" TEXT,
    "stadiumId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTemplateReferee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentTemplateReferee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentTemplate_tenantId_createdAt_idx" ON "TournamentTemplate"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentTemplate_tenantId_name_idx" ON "TournamentTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TournamentTemplateReferee_tenantId_templateId_idx" ON "TournamentTemplateReferee"("tenantId", "templateId");

-- CreateIndex
CREATE INDEX "TournamentTemplateReferee_tenantId_refereeId_idx" ON "TournamentTemplateReferee"("tenantId", "refereeId");

-- AddForeignKey
ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplate" ADD CONSTRAINT "TournamentTemplate_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplateReferee" ADD CONSTRAINT "TournamentTemplateReferee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplateReferee" ADD CONSTRAINT "TournamentTemplateReferee_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "TournamentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentTemplateReferee" ADD CONSTRAINT "TournamentTemplateReferee_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTemplateReferee_templateId_refereeId_key" ON "TournamentTemplateReferee"("templateId", "refereeId");
