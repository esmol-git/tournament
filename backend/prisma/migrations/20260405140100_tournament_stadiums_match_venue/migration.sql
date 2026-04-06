-- AlterTable (идемпотентно)
ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "stadiumId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TournamentStadium" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentStadium_pkey" PRIMARY KEY ("id")
);

-- Backfill: одна запись на существующий Tournament.stadiumId (без дублей при повторном прогоне)
INSERT INTO "TournamentStadium" ("id", "tenantId", "tournamentId", "stadiumId", "sortOrder", "createdAt")
SELECT
    replace(gen_random_uuid()::text, '-', ''),
    t."tenantId",
    t.id,
    t."stadiumId",
    0,
    CURRENT_TIMESTAMP
FROM "Tournament" t
WHERE t."stadiumId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "TournamentStadium" ts
    WHERE ts."tournamentId" = t.id
      AND ts."stadiumId" = t."stadiumId"
  );

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentStadium_tournamentId_stadiumId_key" ON "TournamentStadium"("tournamentId", "stadiumId");

CREATE INDEX IF NOT EXISTS "TournamentStadium_tenantId_tournamentId_idx" ON "TournamentStadium"("tenantId", "tournamentId");

CREATE INDEX IF NOT EXISTS "TournamentStadium_tenantId_stadiumId_idx" ON "TournamentStadium"("tenantId", "stadiumId");

CREATE INDEX IF NOT EXISTS "Match_tenantId_stadiumId_idx" ON "Match"("tenantId", "stadiumId");

-- AddForeignKey (идемпотентно)
DO $$ BEGIN
  ALTER TABLE "TournamentStadium" ADD CONSTRAINT "TournamentStadium_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentStadium" ADD CONSTRAINT "TournamentStadium_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentStadium" ADD CONSTRAINT "TournamentStadium_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Match" ADD CONSTRAINT "Match_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
