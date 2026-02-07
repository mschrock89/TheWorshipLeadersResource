-- Add duration_seconds column to reference tracks for calculating last song duration
ALTER TABLE public.setlist_playlist_reference_tracks 
ADD COLUMN duration_seconds integer;

-- Update the existing reference track with the known duration (20:44 = 1244 seconds)
UPDATE public.setlist_playlist_reference_tracks 
SET duration_seconds = 1244 
WHERE id = '678ef27e-43f0-4171-95cd-6a7e1ee1ed68';