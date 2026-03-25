-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_tournamentId_fkey";

-- AlterTable
ALTER TABLE "Match" ALTER COLUMN "tournamentId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Match_tenantId_tournamentId_idx" ON "Match"("tenantId", "tournamentId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;
