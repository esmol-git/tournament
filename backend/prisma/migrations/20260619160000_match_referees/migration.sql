-- CreateEnum
CREATE TYPE "MatchRefereeRole" AS ENUM ('MAIN', 'ASSISTANT_1', 'ASSISTANT_2');

-- CreateTable
CREATE TABLE "MatchReferee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "role" "MatchRefereeRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchReferee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchReferee_tenantId_matchId_idx" ON "MatchReferee"("tenantId", "matchId");

-- CreateIndex
CREATE INDEX "MatchReferee_refereeId_idx" ON "MatchReferee"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReferee_matchId_role_key" ON "MatchReferee"("matchId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MatchReferee_matchId_refereeId_key" ON "MatchReferee"("matchId", "refereeId");

-- AddForeignKey
ALTER TABLE "MatchReferee" ADD CONSTRAINT "MatchReferee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReferee" ADD CONSTRAINT "MatchReferee_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchReferee" ADD CONSTRAINT "MatchReferee_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
