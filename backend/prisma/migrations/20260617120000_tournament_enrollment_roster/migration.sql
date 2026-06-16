-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "TournamentEnrollmentMode" AS ENUM ('MANUAL', 'APPLICATIONS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TournamentEligibilityProfile" AS ENUM ('YOUTH', 'STANDARD');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TournamentRosterPlayerStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable Tournament
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "enrollmentMode" "TournamentEnrollmentMode" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "eligibilityProfile" "TournamentEligibilityProfile" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "rosterMinPlayers" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "rosterMaxPlayers" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "rosterDeadlineAt" TIMESTAMP(3);

-- CreateTable TournamentTeamPlayer
CREATE TABLE IF NOT EXISTS "TournamentTeamPlayer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "jerseyNumber" INTEGER,
    "status" "TournamentRosterPlayerStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTeamPlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TournamentTeamPlayer_tournamentId_teamId_playerId_key"
  ON "TournamentTeamPlayer"("tournamentId", "teamId", "playerId");
CREATE INDEX IF NOT EXISTS "TournamentTeamPlayer_tenantId_tournamentId_teamId_idx"
  ON "TournamentTeamPlayer"("tenantId", "tournamentId", "teamId");
CREATE INDEX IF NOT EXISTS "TournamentTeamPlayer_playerId_idx"
  ON "TournamentTeamPlayer"("playerId");

DO $$ BEGIN
  ALTER TABLE "TournamentTeamPlayer"
    ADD CONSTRAINT "TournamentTeamPlayer_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentTeamPlayer"
    ADD CONSTRAINT "TournamentTeamPlayer_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentTeamPlayer"
    ADD CONSTRAINT "TournamentTeamPlayer_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentTeamPlayer"
    ADD CONSTRAINT "TournamentTeamPlayer_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
