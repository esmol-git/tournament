-- CreateEnum
CREATE TYPE "TournamentVenueMode" AS ENUM ('SINGLE_VENUE', 'MULTI_VENUE', 'HOME_STADIUM');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "venueMode" "TournamentVenueMode" NOT NULL DEFAULT 'MULTI_VENUE';

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "homeStadiumId" TEXT;

-- CreateTable
CREATE TABLE "StadiumGalleryImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stadiumId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StadiumGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StadiumGalleryImage_tenantId_stadiumId_sortOrder_idx" ON "StadiumGalleryImage"("tenantId", "stadiumId", "sortOrder");

-- CreateIndex
CREATE INDEX "StadiumGalleryImage_tenantId_createdAt_idx" ON "StadiumGalleryImage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Team_tenantId_homeStadiumId_idx" ON "Team"("tenantId", "homeStadiumId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_homeStadiumId_fkey" FOREIGN KEY ("homeStadiumId") REFERENCES "Stadium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadiumGalleryImage" ADD CONSTRAINT "StadiumGalleryImage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadiumGalleryImage" ADD CONSTRAINT "StadiumGalleryImage_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
