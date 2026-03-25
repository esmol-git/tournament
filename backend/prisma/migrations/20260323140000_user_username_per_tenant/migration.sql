-- Add username column as nullable first to backfill existing users.
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- Backfill usernames from email local-part; ensure uniqueness within tenant.
WITH prepared AS (
  SELECT
    id,
    "tenantId",
    regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]+', '_', 'g') AS base
  FROM "User"
),
ranked AS (
  SELECT
    id,
    "tenantId",
    CASE
      WHEN base IS NULL OR base = '' THEN 'user'
      ELSE trim(both '_' FROM base)
    END AS normalized_base,
    row_number() OVER (
      PARTITION BY "tenantId",
      CASE
        WHEN base IS NULL OR base = '' THEN 'user'
        ELSE trim(both '_' FROM base)
      END
      ORDER BY id
    ) AS rn
  FROM prepared
)
UPDATE "User" u
SET "username" = CASE
  WHEN r.rn = 1 THEN r.normalized_base
  ELSE r.normalized_base || '_' || r.rn::text
END
FROM ranked r
WHERE u.id = r.id;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- Unique only inside one tenant.
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");
