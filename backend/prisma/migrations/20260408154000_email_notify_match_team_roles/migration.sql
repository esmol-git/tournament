ALTER TABLE "Tenant"
ADD COLUMN "emailNotifyMatchTeamCoachRole" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailNotifyMatchTeamAdminRole" BOOLEAN NOT NULL DEFAULT false;
