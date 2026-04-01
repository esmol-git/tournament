-- News section + tags catalog

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NewsSection') THEN
    CREATE TYPE "NewsSection" AS ENUM (
      'ANNOUNCEMENT',
      'REPORT',
      'INTERVIEW',
      'OFFICIAL',
      'MEDIA'
    );
  END IF;
END $$;

ALTER TABLE "TournamentNews"
ADD COLUMN "section" "NewsSection" NOT NULL DEFAULT 'ANNOUNCEMENT';

CREATE TABLE "NewsTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NewsTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentNewsTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "newsId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TournamentNewsTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsTag_tenantId_slug_key" ON "NewsTag"("tenantId", "slug");
CREATE INDEX "NewsTag_tenantId_sortOrder_idx" ON "NewsTag"("tenantId", "sortOrder");

CREATE UNIQUE INDEX "TournamentNewsTag_newsId_tagId_key" ON "TournamentNewsTag"("newsId", "tagId");
CREATE INDEX "TournamentNewsTag_tenantId_newsId_idx" ON "TournamentNewsTag"("tenantId", "newsId");
CREATE INDEX "TournamentNewsTag_tenantId_tagId_idx" ON "TournamentNewsTag"("tenantId", "tagId");

ALTER TABLE "NewsTag"
ADD CONSTRAINT "NewsTag_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentNewsTag"
ADD CONSTRAINT "TournamentNewsTag_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentNewsTag"
ADD CONSTRAINT "TournamentNewsTag_newsId_fkey"
FOREIGN KEY ("newsId") REFERENCES "TournamentNews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TournamentNewsTag"
ADD CONSTRAINT "TournamentNewsTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "NewsTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
