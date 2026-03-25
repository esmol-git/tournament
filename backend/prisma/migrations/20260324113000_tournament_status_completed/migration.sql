DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TournamentStatus'
      AND e.enumlabel = 'COMPLETED'
  ) THEN
    ALTER TYPE "TournamentStatus" ADD VALUE 'COMPLETED';
  END IF;
END
$$;
