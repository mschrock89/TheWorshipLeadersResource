-- VIDEO is a Live position alongside FOH, MON, and BCAST.
-- Line notes stay with that position the same way the audio positions do.

ALTER TABLE public.live_line_notes
  DROP CONSTRAINT IF EXISTS live_line_notes_station_check;

ALTER TABLE public.live_line_notes
  ADD CONSTRAINT live_line_notes_station_check
  CHECK (station IN ('foh', 'mon', 'bcast', 'video'));
