-- Create the new user_campus_ministry_positions table
CREATE TABLE public.user_campus_ministry_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL,
  position TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, campus_id, ministry_type, position)
);

-- Enable RLS
ALTER TABLE public.user_campus_ministry_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view campus ministry positions"
ON public.user_campus_ministry_positions
FOR SELECT
USING (true);

CREATE POLICY "Leaders can manage campus ministry positions"
ON public.user_campus_ministry_positions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('admin', 'campus_admin', 'leader')
  )
);

CREATE POLICY "Users can manage their own positions"
ON public.user_campus_ministry_positions
FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_user_campus_ministry_positions_user ON public.user_campus_ministry_positions(user_id);
CREATE INDEX idx_user_campus_ministry_positions_campus ON public.user_campus_ministry_positions(campus_id);
CREATE INDEX idx_user_campus_ministry_positions_campus_ministry ON public.user_campus_ministry_positions(campus_id, ministry_type);

-- Migrate existing data: For each user_ministry_campuses record, copy all positions from profiles.positions
INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
SELECT 
  umc.user_id,
  umc.campus_id,
  umc.ministry_type,
  unnest(p.positions) as position
FROM public.user_ministry_campuses umc
JOIN public.profiles p ON p.id = umc.user_id
WHERE p.positions IS NOT NULL AND array_length(p.positions, 1) > 0
ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;