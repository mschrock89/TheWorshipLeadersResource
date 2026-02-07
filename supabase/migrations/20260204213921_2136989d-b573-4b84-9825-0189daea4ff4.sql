-- Create junction table for multiple vocalists per song in draft sets
CREATE TABLE public.draft_set_song_vocalists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_song_id UUID NOT NULL REFERENCES public.draft_set_songs(id) ON DELETE CASCADE,
  vocalist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate vocalist assignments to the same song
  UNIQUE(draft_set_song_id, vocalist_id)
);

-- Create junction table for multiple vocalists per song in service flow items
CREATE TABLE public.service_flow_item_vocalists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_flow_item_id UUID NOT NULL REFERENCES public.service_flow_items(id) ON DELETE CASCADE,
  vocalist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate vocalist assignments to the same item
  UNIQUE(service_flow_item_id, vocalist_id)
);

-- Enable RLS on both tables
ALTER TABLE public.draft_set_song_vocalists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_flow_item_vocalists ENABLE ROW LEVEL SECURITY;

-- RLS policies for draft_set_song_vocalists (same access as draft_set_songs)
CREATE POLICY "Authenticated users can view draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete draft set song vocalists" 
ON public.draft_set_song_vocalists 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- RLS policies for service_flow_item_vocalists (same access as service_flow_items)
CREATE POLICY "Authenticated users can view service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete service flow item vocalists" 
ON public.service_flow_item_vocalists 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Create indexes for performance
CREATE INDEX idx_draft_set_song_vocalists_song_id ON public.draft_set_song_vocalists(draft_set_song_id);
CREATE INDEX idx_service_flow_item_vocalists_item_id ON public.service_flow_item_vocalists(service_flow_item_id);