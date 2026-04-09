-- Per-tenant Telegram notifications settings
ALTER TABLE "Tenant"
ADD COLUMN "telegramNotifyChatId" TEXT,
ADD COLUMN "telegramNotifyOnMatchRescheduled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "telegramNotifyOnProtocolPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "telegramNotifyOnMatchStartingSoon" BOOLEAN NOT NULL DEFAULT false;
