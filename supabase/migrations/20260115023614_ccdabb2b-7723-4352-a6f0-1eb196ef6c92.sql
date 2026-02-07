-- Add published_at column to draft_sets
ALTER TABLE public.draft_sets 
ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Create setlist_confirmations table
CREATE TABLE public.setlist_confirmations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(draft_set_id, user_id)
);

-- Enable RLS
ALTER TABLE public.setlist_confirmations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view confirmations for setlists in their campus
CREATE POLICY "Users can view confirmations for their campus setlists"
ON public.setlist_confirmations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.draft_sets ds
    JOIN public.user_campuses uc ON uc.campus_id = ds.campus_id
    WHERE ds.id = setlist_confirmations.draft_set_id
    AND uc.user_id = auth.uid()
  )
);

-- Policy: Users can insert their own confirmations
CREATE POLICY "Users can confirm their own setlists"
ON public.setlist_confirmations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own confirmations (in case they need to re-confirm)
CREATE POLICY "Users can delete their own confirmations"
ON public.setlist_confirmations
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_setlist_confirmations_draft_set ON public.setlist_confirmations(draft_set_id);
CREATE INDEX idx_setlist_confirmations_user ON public.setlist_confirmations(user_id);
CREATE INDEX idx_draft_sets_published_at ON public.draft_sets(published_at) WHERE published_at IS NOT NULL;