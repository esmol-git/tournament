-- One-time data migration:
-- Convert legacy ADMIN role to TENANT_ADMIN.
--
-- Run from backend/ with:
--   npx prisma db execute --file scripts/migrate_roles_admin_to_tenant_admin.sql

UPDATE "User"
SET role = 'TENANT_ADMIN'
WHERE role = 'ADMIN';

