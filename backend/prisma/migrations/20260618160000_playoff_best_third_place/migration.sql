-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "playoffBestThirdPlaceCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TournamentTemplate" ADD COLUMN "playoffBestThirdPlaceCount" INTEGER NOT NULL DEFAULT 0;
