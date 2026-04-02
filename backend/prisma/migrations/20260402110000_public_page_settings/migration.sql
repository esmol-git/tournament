-- AlterTable
ALTER TABLE "Tenant"
ADD COLUMN "publicOrganizationDisplayName" TEXT,
ADD COLUMN "publicContactPhone" TEXT,
ADD COLUMN "publicContactEmail" TEXT,
ADD COLUMN "publicContactAddress" TEXT,
ADD COLUMN "publicContactHours" TEXT,
ADD COLUMN "publicSeoTitle" TEXT,
ADD COLUMN "publicSeoDescription" TEXT,
ADD COLUMN "publicOgImageUrl" TEXT,
ADD COLUMN "publicDefaultLanding" TEXT NOT NULL DEFAULT 'tournaments',
ADD COLUMN "publicTournamentTabsOrder" TEXT NOT NULL DEFAULT 'table,chessboard,progress,playoff',
ADD COLUMN "publicShowLeaderInFacts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "publicShowTopStats" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "publicShowNewsInSidebar" BOOLEAN NOT NULL DEFAULT true;
