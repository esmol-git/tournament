-- FREE + 4 платных тарифа; маппинг со старых STANDARD/PRO.
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('FREE', 'AMATEUR', 'PREMIER', 'CHAMPIONS', 'WORLD_CUP');

ALTER TABLE "Tenant" ALTER COLUMN "subscriptionPlan" DROP DEFAULT;

ALTER TABLE "Tenant" ALTER COLUMN "subscriptionPlan" TYPE "SubscriptionPlan_new" USING (
  CASE "subscriptionPlan"::text
    WHEN 'FREE' THEN 'FREE'::"SubscriptionPlan_new"
    WHEN 'STANDARD' THEN 'AMATEUR'::"SubscriptionPlan_new"
    WHEN 'PRO' THEN 'CHAMPIONS'::"SubscriptionPlan_new"
    ELSE 'FREE'::"SubscriptionPlan_new"
  END
);

ALTER TABLE "Tenant" ALTER COLUMN "subscriptionPlan" SET DEFAULT 'FREE'::"SubscriptionPlan_new";

DROP TYPE "SubscriptionPlan";

ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";
