ALTER TABLE "Tenant"
ADD COLUMN "publicLogoUrl" TEXT,
ADD COLUMN "publicFaviconUrl" TEXT,
ADD COLUMN "publicAccentPrimary" TEXT NOT NULL DEFAULT '#123c67',
ADD COLUMN "publicAccentSecondary" TEXT NOT NULL DEFAULT '#c80a48',
ADD COLUMN "publicThemeMode" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN "publicTagline" TEXT;
