-- AlterEnum
ALTER TYPE "MatchScheduleReasonScope" ADD VALUE 'TECHNICAL';

-- AlterTable
ALTER TABLE "Tournament"
ADD COLUMN "technicalWinGoalsFor" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "technicalWinGoalsAgainst" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "isTechnicalResult" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "technicalResultSide" "MatchTeamSide";
