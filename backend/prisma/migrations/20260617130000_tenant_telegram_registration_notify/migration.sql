-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "telegramNotifyOnRegistrationSubmitted" BOOLEAN NOT NULL DEFAULT true;
