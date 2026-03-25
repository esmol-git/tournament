DO $$
BEGIN
  CREATE TYPE "TeamCategoryType" AS ENUM ('AGE', 'GENDER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "TeamCategory"
ADD COLUMN IF NOT EXISTS "type" "TeamCategoryType" NOT NULL DEFAULT 'AGE';

CREATE TABLE IF NOT EXISTS "TeamCategoryAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamCategoryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamCategoryAssignment_teamId_categoryId_key"
  ON "TeamCategoryAssignment"("teamId", "categoryId");
CREATE INDEX IF NOT EXISTS "TeamCategoryAssignment_tenantId_teamId_idx"
  ON "TeamCategoryAssignment"("tenantId", "teamId");
CREATE INDEX IF NOT EXISTS "TeamCategoryAssignment_tenantId_categoryId_idx"
  ON "TeamCategoryAssignment"("tenantId", "categoryId");

DO $$
BEGIN
  ALTER TABLE "TeamCategoryAssignment"
    ADD CONSTRAINT "TeamCategoryAssignment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "TeamCategoryAssignment"
    ADD CONSTRAINT "TeamCategoryAssignment_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "TeamCategoryAssignment"
    ADD CONSTRAINT "TeamCategoryAssignment_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TeamCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
