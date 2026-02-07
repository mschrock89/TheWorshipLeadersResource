-- Add vocalist assignment to draft_set_songs
ALTER TABLE public.draft_set_songs
ADD COLUMN vocalist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_draft_set_songs_vocalist ON public.draft_set_songs(vocalist_id);