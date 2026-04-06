-- Optional JSON/text snapshots for support (truncated at write time).
ALTER TABLE "AdminAuditLog" ADD COLUMN "requestBody" TEXT;
ALTER TABLE "AdminAuditLog" ADD COLUMN "requestHeaders" TEXT;
