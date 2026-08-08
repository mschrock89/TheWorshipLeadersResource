-- Track teams hidden for a specific rotation period (trimester).
-- Presence of a row means the team is hidden for that period only.
CREATE TABLE public.team_period_hides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  hidden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hidden_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (team_id, rotation_period_id)
);

ALTER TABLE public.team_period_hides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team hides"
ON public.team_period_hides
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_admin'::app_role));

CREATE POLICY "Authenticated users can view team hides"
ON public.team_period_hides
FOR SELECT
USING (auth.uid() IS NOT NULL);
