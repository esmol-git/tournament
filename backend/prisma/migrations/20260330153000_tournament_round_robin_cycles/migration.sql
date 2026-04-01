-- Add configurable number of round-robin cycles per tournament.
ALTER TABLE "Tournament"
ADD COLUMN "roundRobinCycles" INTEGER NOT NULL DEFAULT 1;
