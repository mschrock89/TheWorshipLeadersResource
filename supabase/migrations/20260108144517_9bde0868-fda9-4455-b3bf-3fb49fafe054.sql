-- Create table to track locked teams per rotation period
CREATE TABLE public.team_period_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  rotation_period_id UUID NOT NULL REFERENCES public.rotation_periods(id) ON DELETE CASCADE,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, rotation_period_id)
);

-- Enable RLS
ALTER TABLE public.team_period_locks ENABLE ROW LEVEL SECURITY;

-- Admins can manage locks
CREATE POLICY "Admins can manage team locks"
ON public.team_period_locks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'campus_admin'::app_role));

-- Authenticated users can view locks
CREATE POLICY "Authenticated users can view locks"
ON public.team_period_locks
FOR SELECT
USING (auth.uid() IS NOT NULL);