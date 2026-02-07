
-- Create worship_teams table
CREATE TABLE public.worship_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_schedule table
CREATE TABLE public.team_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  rotation_period TEXT NOT NULL DEFAULT 'T1 2026',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.worship_teams(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  position TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.worship_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for worship_teams (readable by all authenticated users)
CREATE POLICY "Authenticated users can view worship teams"
ON public.worship_teams FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage worship teams"
ON public.worship_teams FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for team_schedule
CREATE POLICY "Authenticated users can view team schedule"
ON public.team_schedule FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage team schedule"
ON public.team_schedule FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- RLS policies for team_members
CREATE POLICY "Authenticated users can view team members"
ON public.team_members FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Leaders can manage team members"
ON public.team_members FOR ALL
USING (has_role(auth.uid(), 'leader'::app_role));

-- Create indexes for performance
CREATE INDEX idx_team_schedule_date ON public.team_schedule(schedule_date);
CREATE INDEX idx_team_schedule_team_id ON public.team_schedule(team_id);
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);
