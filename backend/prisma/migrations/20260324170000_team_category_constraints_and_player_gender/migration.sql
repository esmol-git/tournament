DO $$
BEGIN
  CREATE TYPE "PlayerGender" AS ENUM ('MALE', 'FEMALE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "Player"
ADD COLUMN IF NOT EXISTS "gender" "PlayerGender";

ALTER TABLE "TeamCategory"
ADD COLUMN IF NOT EXISTS "minBirthYear" INTEGER,
ADD COLUMN IF NOT EXISTS "allowedGenders" "PlayerGender"[] NOT NULL DEFAULT ARRAY[]::"PlayerGender"[];
