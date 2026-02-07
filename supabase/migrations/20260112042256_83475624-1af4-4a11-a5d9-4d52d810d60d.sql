
-- Create table for campus-specific ministry assignments
-- This allows a volunteer to have Weekend ministry at Tullahoma but only Encounter/EON at Murfreesboro Central
CREATE TABLE public.user_ministry_campuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, campus_id, ministry_type)
);

-- Enable RLS
ALTER TABLE public.user_ministry_campuses ENABLE ROW LEVEL SECURITY;

-- Policies for user_ministry_campuses
CREATE POLICY "Users can view their own ministry assignments"
ON public.user_ministry_campuses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Leaders can view all ministry assignments"
ON public.user_ministry_campuses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

CREATE POLICY "Leaders can insert ministry assignments"
ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

CREATE POLICY "Leaders can delete ministry assignments"
ON public.user_ministry_campuses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'campus_admin', 'network_worship_pastor', 'campus_worship_pastor')
  )
);

-- Users can manage their own ministry assignments
CREATE POLICY "Users can insert their own ministry assignments"
ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ministry assignments"
ON public.user_ministry_campuses
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ministry_campuses;

-- Migrate existing data: For each user's ministry_types, create entries for ALL their campuses
-- This preserves current behavior while enabling campus-specific assignments
INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
SELECT DISTINCT
  p.id as user_id,
  uc.campus_id,
  unnest(p.ministry_types) as ministry_type
FROM profiles p
CROSS JOIN user_campuses uc
WHERE p.id = uc.user_id
AND p.ministry_types IS NOT NULL
AND array_length(p.ministry_types, 1) > 0
ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;
