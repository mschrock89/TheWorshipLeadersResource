ALTER TABLE public.draft_set_songs
ADD COLUMN IF NOT EXISTS youtube_url text;
