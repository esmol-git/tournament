-- Логотип для экспорта турнирной таблицы в PNG (соцсети).
ALTER TABLE "Tenant" ADD COLUMN "shareTableImageLogoUrl" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "shareTableImageShowLogo" BOOLEAN NOT NULL DEFAULT true;
