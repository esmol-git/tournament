-- AlterTable (идемпотентно: колонка могла уже существовать после переименования миграции / ручного применения)
ALTER TABLE "TournamentTeam" ADD COLUMN IF NOT EXISTS "groupSortOrder" INTEGER NOT NULL DEFAULT 0;
