-- TournamentRosterPlayerStatus: DISQUALIFIED
DO $$ BEGIN
  ALTER TYPE "TournamentRosterPlayerStatus" ADD VALUE IF NOT EXISTS 'DISQUALIFIED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- TournamentTeamPlayer: sanction fields
ALTER TABLE "TournamentTeamPlayer" ADD COLUMN IF NOT EXISTS "sanctionNote" TEXT;
ALTER TABLE "TournamentTeamPlayer" ADD COLUMN IF NOT EXISTS "sanctionedAt" TIMESTAMP(3);
ALTER TABLE "TournamentTeamPlayer" ADD COLUMN IF NOT EXISTS "sanctionedByUserId" TEXT;

DO $$ BEGIN
  ALTER TABLE "TournamentTeamPlayer"
    ADD CONSTRAINT "TournamentTeamPlayer_sanctionedByUserId_fkey"
    FOREIGN KEY ("sanctionedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- TournamentRegistration: attachment
ALTER TABLE "TournamentRegistration" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "TournamentRegistration" ADD COLUMN IF NOT EXISTS "attachmentFileName" TEXT;

-- Player: global active flag
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
