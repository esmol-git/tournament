-- One-time data migration:
-- Ensure Tournament.slug is NOT NULL before making it required in Prisma.
-- Strategy: fill NULL slugs with the tournament id (always unique).
--
-- Run from backend/ with:
--   npx prisma db execute --file scripts/backfill_tournament_slugs.sql
--
UPDATE "Tournament"
SET "slug" = "id"
WHERE "slug" IS NULL OR "slug" = '';

