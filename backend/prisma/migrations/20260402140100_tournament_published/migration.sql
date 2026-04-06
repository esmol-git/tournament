-- AlterTable (идемпотентно: колонка могла уже существовать)
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT false;

-- Уже «живые» на сайте турниры оставляем опубликованными (поведение до флага).
UPDATE "Tournament"
SET "published" = true
WHERE "status" IN ('ACTIVE', 'COMPLETED', 'ARCHIVED');
