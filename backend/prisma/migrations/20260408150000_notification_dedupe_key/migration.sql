ALTER TABLE "TelegramNotificationDelivery"
ADD COLUMN "dedupeKey" TEXT;

CREATE INDEX "TelegramNotificationDelivery_tenantId_channel_dedupeKey_createdAt_idx"
ON "TelegramNotificationDelivery"("tenantId", "channel", "dedupeKey", "createdAt");
