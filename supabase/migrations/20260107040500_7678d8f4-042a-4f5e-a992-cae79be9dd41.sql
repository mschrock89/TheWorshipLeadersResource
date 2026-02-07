-- Create draft_sets table for storing planned worship sets
CREATE TABLE public.draft_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  ministry_type TEXT NOT NULL DEFAULT 'weekend',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create draft_set_songs table for songs in each draft set
CREATE TABLE public.draft_set_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_set_id UUID NOT NULL REFERENCES public.draft_sets(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  song_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.draft_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draft_set_songs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for draft_sets
CREATE POLICY "Users can view draft sets for their campuses"
ON public.draft_sets
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR (campus_id IN (
    SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()
  ))
);

CREATE POLICY "Campus admins and pastors can create draft sets"
ON public.draft_sets
FOR INSERT
WITH CHECK (
  auth.uid() = created_by
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
    OR has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

CREATE POLICY "Users can update their own draft sets or admins can update any"
ON public.draft_sets
FOR UPDATE
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Users can delete their own draft sets or admins can delete any"
ON public.draft_sets
FOR DELETE
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- RLS Policies for draft_set_songs (inherit from parent draft_set access)
CREATE POLICY "Users can view songs in accessible draft sets"
ON public.draft_set_songs
FOR SELECT
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
  )
);

CREATE POLICY "Users can manage songs in their draft sets"
ON public.draft_set_songs
FOR INSERT
WITH CHECK (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can update songs in their draft sets"
ON public.draft_set_songs
FOR UPDATE
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

CREATE POLICY "Users can delete songs from their draft sets"
ON public.draft_set_songs
FOR DELETE
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE created_by = auth.uid()
      OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Create trigger for updated_at on draft_sets
CREATE TRIGGER update_draft_sets_updated_at
BEFORE UPDATE ON public.draft_sets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint to prevent duplicate songs in same draft
CREATE UNIQUE INDEX idx_draft_set_songs_unique ON public.draft_set_songs(draft_set_id, song_id);