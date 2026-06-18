-- Состав бригады на матч, роль VAR, номер поля на стадионе
CREATE TYPE "TournamentMatchOfficialsProfile" AS ENUM ('MAIN_ONLY', 'CREW_OF_3', 'CREW_OF_3_WITH_VAR');

ALTER TYPE "MatchRefereeRole" ADD VALUE 'VAR';

ALTER TABLE "Tournament" ADD COLUMN "matchOfficialsProfile" "TournamentMatchOfficialsProfile" NOT NULL DEFAULT 'CREW_OF_3';

ALTER TABLE "Match" ADD COLUMN "pitchNumber" INTEGER;
