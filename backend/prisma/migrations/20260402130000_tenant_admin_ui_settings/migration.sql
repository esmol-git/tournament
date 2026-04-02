-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "adminUiSettings" JSONB;

-- Перенос из User.uiSettings: по одному значению на организацию (приоритет TENANT_ADMIN, затем SUPER_ADMIN).
UPDATE "Tenant" AS t
SET "adminUiSettings" = s."uiSettings"
FROM (
  SELECT DISTINCT ON ("tenantId") "tenantId", "uiSettings"
  FROM "User"
  WHERE "uiSettings" IS NOT NULL
  ORDER BY
    "tenantId",
    CASE
      WHEN "role"::text = 'TENANT_ADMIN' THEN 0
      WHEN "role"::text = 'SUPER_ADMIN' THEN 1
      ELSE 2
    END,
    "updatedAt" DESC
) AS s
WHERE t.id = s."tenantId";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "uiSettings";
