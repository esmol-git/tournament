ALTER TABLE "Tenant"
ADD COLUMN "emailNotifyRecipients" TEXT,
ADD COLUMN "emailNotifyEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailNotifyOnMatchRescheduled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailNotifyOnProtocolPublished" BOOLEAN NOT NULL DEFAULT true;
