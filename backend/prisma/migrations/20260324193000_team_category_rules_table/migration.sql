CREATE TABLE IF NOT EXISTS "TeamCategoryRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "type" "TeamCategoryType" NOT NULL,
  "minBirthYear" INTEGER,
  "maxBirthYear" INTEGER,
  "requireBirthDate" BOOLEAN NOT NULL DEFAULT false,
  "allowedGenders" "PlayerGender"[] NOT NULL DEFAULT ARRAY[]::"PlayerGender"[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TeamCategoryRule_tenantId_categoryId_idx"
  ON "TeamCategoryRule"("tenantId", "categoryId");

DO $$
BEGIN
  ALTER TABLE "TeamCategoryRule"
    ADD CONSTRAINT "TeamCategoryRule_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "TeamCategoryRule"
    ADD CONSTRAINT "TeamCategoryRule_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "TeamCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
