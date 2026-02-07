-- Make song_id nullable in album_tracks to allow standalone album tracks
ALTER TABLE public.album_tracks 
ALTER COLUMN song_id DROP NOT NULL;

-- Add columns for standalone track info
ALTER TABLE public.album_tracks
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS author TEXT,
ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Add constraint: either song_id OR title must be present
ALTER TABLE public.album_tracks
ADD CONSTRAINT album_tracks_has_title_or_song 
CHECK (song_id IS NOT NULL OR title IS NOT NULL);