-- Live line notes are private to the person and to the position they were
-- written under: FOH, MON, or BCAST. Notes saved before this column existed
-- stay on FOH, which is the position Live opens on.

ALTER TABLE public.live_line_notes
  ADD COLUMN IF NOT EXISTS station text;

UPDATE public.live_line_notes
SET station = 'foh'
WHERE station IS NULL;

ALTER TABLE public.live_line_notes
  ALTER COLUMN station SET DEFAULT 'foh';

ALTER TABLE public.live_line_notes
  ALTER COLUMN station SET NOT NULL;

ALTER TABLE public.live_line_notes
  DROP CONSTRAINT IF EXISTS live_line_notes_station_check;

ALTER TABLE public.live_line_notes
  ADD CONSTRAINT live_line_notes_station_check
  CHECK (station IN ('foh', 'mon', 'bcast'));

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'live_line_notes'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) NOT LIKE '%station%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.live_line_notes DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS live_line_notes_user_item_station_idx
  ON public.live_line_notes (user_id, service_flow_item_id, station);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.live_line_notes'::regclass
      AND conname = 'live_line_notes_user_item_station_key'
  ) THEN
    ALTER TABLE public.live_line_notes
      ADD CONSTRAINT live_line_notes_user_item_station_key
      UNIQUE USING INDEX live_line_notes_user_item_station_idx;
  END IF;
END $$;
