-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;

-- Уже «живые» на сайте турниры оставляем опубликованными (поведение до флага).
UPDATE "Tournament"
SET "published" = true
WHERE "status" IN ('ACTIVE', 'COMPLETED', 'ARCHIVED');
