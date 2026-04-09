-- Per-match visibility on public site / public ICS feed (bulk hide/show in admin).
ALTER TABLE "Match" ADD COLUMN "publishedOnPublic" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Match_tournamentId_publishedOnPublic_idx" ON "Match"("tournamentId", "publishedOnPublic");
