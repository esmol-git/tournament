-- AlterTable
ALTER TABLE "Tournament"
ADD COLUMN "cardAutoBanEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "redCardBanMatches" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "yellowAccumulationThreshold" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN "yellowAccumulationBanMatches" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "TournamentTeamPlayer"
ADD COLUMN "suspendedMatchesRemaining" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "yellowCardsAccumulated" INTEGER NOT NULL DEFAULT 0;
