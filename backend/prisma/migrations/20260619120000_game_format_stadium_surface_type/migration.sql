-- CreateEnum
CREATE TYPE "TournamentGameFormat" AS ENUM (
  'THREE_V_THREE_NO_GK',
  'FOUR_PLUS_ONE',
  'FIVE_PLUS_ONE',
  'SIX_PLUS_ONE',
  'SEVEN_PLUS_ONE',
  'EIGHT_V_EIGHT',
  'NINE_V_NINE',
  'ELEVEN_V_ELEVEN',
  'CUSTOM'
);

CREATE TYPE "StadiumSurfaceType" AS ENUM (
  'NATURAL_GRASS',
  'ARTIFICIAL_TURF',
  'PARQUET',
  'INDOOR',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "gameFormat" "TournamentGameFormat";
ALTER TABLE "Tournament" ADD COLUMN IF NOT EXISTS "gameFormatNote" TEXT;

ALTER TABLE "Stadium" ADD COLUMN IF NOT EXISTS "surfaceType" "StadiumSurfaceType";
