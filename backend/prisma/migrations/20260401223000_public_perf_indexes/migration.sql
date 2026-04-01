-- Public read performance indexes:
-- - tenant tournaments lists
-- - news / gallery feeds
-- - calendar filters
-- - standings rendering

CREATE INDEX IF NOT EXISTS "Tournament_tenantId_status_createdAt_idx"
  ON "Tournament"("tenantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "TournamentNews_tenantId_published_publishedAt_idx"
  ON "TournamentNews"("tenantId", "published", "publishedAt");

CREATE INDEX IF NOT EXISTS "TournamentGalleryImage_tenantId_createdAt_idx"
  ON "TournamentGalleryImage"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "Match_tournamentId_status_startTime_idx"
  ON "Match"("tournamentId", "status", "startTime");

CREATE INDEX IF NOT EXISTS "TournamentTableRow_tournamentId_position_idx"
  ON "TournamentTableRow"("tournamentId", "position");
