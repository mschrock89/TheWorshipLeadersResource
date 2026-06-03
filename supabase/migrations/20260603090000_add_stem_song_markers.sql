-- Add song_markers JSONB column to stem sessions.
-- Each marker stores: { id, songId, songTitle, timestampSeconds }
-- so users can click to skip to any song in the stem timeline.

ALTER TABLE public.setlist_stem_sessions
  ADD COLUMN IF NOT EXISTS song_markers jsonb NOT NULL DEFAULT '[]'::jsonb;
