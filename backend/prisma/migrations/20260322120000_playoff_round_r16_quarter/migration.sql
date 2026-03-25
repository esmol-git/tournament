-- Расширение enum под стадии плей-офф (данные / генерация сетки).
-- Идемпотентно: если метка уже есть в типе — пропускаем.
DO $migration$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PlayoffRound' AND e.enumlabel = 'ROUND_OF_16'
  ) THEN
    ALTER TYPE "PlayoffRound" ADD VALUE 'ROUND_OF_16';
  END IF;
END $migration$;

DO $migration$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PlayoffRound' AND e.enumlabel = 'QUARTERFINAL'
  ) THEN
    ALTER TYPE "PlayoffRound" ADD VALUE 'QUARTERFINAL';
  END IF;
END $migration$;
