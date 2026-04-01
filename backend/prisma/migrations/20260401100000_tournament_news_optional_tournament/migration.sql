-- Черновики без привязки к турниру; публикация только с tournamentId (проверка в приложении).
-- Должна идти ПОСЛЕ 20260401090000_tournament_news (создание таблицы).
ALTER TABLE "TournamentNews" DROP CONSTRAINT "TournamentNews_tournamentId_fkey";

ALTER TABLE "TournamentNews" ALTER COLUMN "tournamentId" DROP NOT NULL;

ALTER TABLE "TournamentNews" ADD CONSTRAINT "TournamentNews_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "TournamentNews_tournamentId_slug_key";

CREATE UNIQUE INDEX "TournamentNews_draft_tenant_slug" ON "TournamentNews" ("tenantId", "slug") WHERE "tournamentId" IS NULL;

CREATE UNIQUE INDEX "TournamentNews_tournament_slug" ON "TournamentNews" ("tournamentId", "slug") WHERE "tournamentId" IS NOT NULL;
