-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'STANDARD', 'PRO');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Tenant" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "billingCustomerId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "billingSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_subscriptionEndsAt_idx" ON "Tenant"("subscriptionEndsAt");
