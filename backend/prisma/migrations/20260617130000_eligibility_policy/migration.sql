-- CreateTable
CREATE TABLE "EligibilityPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requireBirthDate" BOOLEAN NOT NULL DEFAULT false,
    "minBirthYear" INTEGER,
    "maxBirthYear" INTEGER,
    "allowedGenders" "PlayerGender"[] DEFAULT ARRAY[]::"PlayerGender"[],
    "ageGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EligibilityPolicy_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CompetitionEdition" ADD COLUMN "eligibilityPolicyId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "eligibilityPolicyId" TEXT;

-- AlterTable
ALTER TABLE "TeamCategory" ADD COLUMN "ageGroupId" TEXT;
ALTER TABLE "TeamCategory" ADD COLUMN "eligibilityPolicyId" TEXT;

-- CreateIndex
CREATE INDEX "EligibilityPolicy_tenantId_name_idx" ON "EligibilityPolicy"("tenantId", "name");
CREATE INDEX "EligibilityPolicy_tenantId_ageGroupId_idx" ON "EligibilityPolicy"("tenantId", "ageGroupId");
CREATE INDEX "TeamCategory_tenantId_ageGroupId_idx" ON "TeamCategory"("tenantId", "ageGroupId");

-- AddForeignKey
ALTER TABLE "EligibilityPolicy" ADD CONSTRAINT "EligibilityPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EligibilityPolicy" ADD CONSTRAINT "EligibilityPolicy_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompetitionEdition" ADD CONSTRAINT "CompetitionEdition_eligibilityPolicyId_fkey" FOREIGN KEY ("eligibilityPolicyId") REFERENCES "EligibilityPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_eligibilityPolicyId_fkey" FOREIGN KEY ("eligibilityPolicyId") REFERENCES "EligibilityPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamCategory" ADD CONSTRAINT "TeamCategory_ageGroupId_fkey" FOREIGN KEY ("ageGroupId") REFERENCES "AgeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TeamCategory" ADD CONSTRAINT "TeamCategory_eligibilityPolicyId_fkey" FOREIGN KEY ("eligibilityPolicyId") REFERENCES "EligibilityPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
