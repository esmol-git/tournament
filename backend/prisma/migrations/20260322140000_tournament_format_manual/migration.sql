DO $migration$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'TournamentFormat' AND e.enumlabel = 'MANUAL'
  ) THEN
    ALTER TYPE "TournamentFormat" ADD VALUE 'MANUAL';
  END IF;
END $migration$;
