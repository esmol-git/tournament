-- Delivery log for tenant Telegram notifications
CREATE TABLE "TelegramNotificationDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'TELEGRAM',
  "kind" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "errorMessage" TEXT,
  "matchId" TEXT,
  "tournamentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),

  CONSTRAINT "TelegramNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramNotificationDelivery_tenantId_createdAt_idx"
ON "TelegramNotificationDelivery"("tenantId", "createdAt");

CREATE INDEX "TelegramNotificationDelivery_tenantId_status_createdAt_idx"
ON "TelegramNotificationDelivery"("tenantId", "status", "createdAt");

CREATE INDEX "TelegramNotificationDelivery_tenantId_kind_createdAt_idx"
ON "TelegramNotificationDelivery"("tenantId", "kind", "createdAt");

ALTER TABLE "TelegramNotificationDelivery"
ADD CONSTRAINT "TelegramNotificationDelivery_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
