-- Section markers heard on the Tracks MP3 (Intro, Verse, Chorus, Instrumental).
-- Mix notes and free notes stay on the same song timeline.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'song_map_cues'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%kind%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.song_map_cues DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.song_map_cues
  ADD CONSTRAINT song_map_cues_kind_check
  CHECK (kind IN ('note', 'mix', 'section'));
