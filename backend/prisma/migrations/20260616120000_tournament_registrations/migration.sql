-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "TournamentRegistrationStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN',
    'WAITLIST'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable (idempotent — maxTeams могла появиться раньше через db push / ручной hotfix)
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "maxTeams" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "registrationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "registrationOpensAt" TIMESTAMP(3);
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "registrationClosesAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TournamentRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "status" "TournamentRegistrationStatus" NOT NULL DEFAULT 'DRAFT',
    "message" TEXT,
    "adminNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentRegistration_tournamentId_teamId_key"
  ON "TournamentRegistration"("tournamentId", "teamId");
CREATE INDEX IF NOT EXISTS "TournamentRegistration_tenantId_tournamentId_status_idx"
  ON "TournamentRegistration"("tenantId", "tournamentId", "status");
CREATE INDEX IF NOT EXISTS "TournamentRegistration_teamId_idx"
  ON "TournamentRegistration"("teamId");

-- AddForeignKey (only if missing)
DO $$ BEGIN
  ALTER TABLE "TournamentRegistration"
    ADD CONSTRAINT "TournamentRegistration_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentRegistration"
    ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey"
    FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentRegistration"
    ADD CONSTRAINT "TournamentRegistration_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentRegistration"
    ADD CONSTRAINT "TournamentRegistration_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TournamentRegistration"
    ADD CONSTRAINT "TournamentRegistration_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
