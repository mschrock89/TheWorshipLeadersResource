-- Remove 'guide' stem type — it is merged into 'click' (both share Ch 16).
-- Any existing guide stems are deleted first since there should be none in production.

DELETE FROM public.setlist_stems WHERE stem_type = 'guide';

-- Postgres does not support DROP VALUE on an enum, so we recreate the type.
ALTER TYPE public.stem_type RENAME TO stem_type_old;

CREATE TYPE public.stem_type AS ENUM (
  'drums',
  'perc',
  'bass',
  'sub_bass',
  'guitars',
  'piano',
  'keys',
  'aux',
  'vocals',
  'click'
);

ALTER TABLE public.setlist_stems
  ALTER COLUMN stem_type TYPE public.stem_type
  USING stem_type::text::public.stem_type;

DROP TYPE public.stem_type_old;
