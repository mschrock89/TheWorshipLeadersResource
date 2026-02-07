-- Drop the partial migration and recreate properly
DROP TABLE IF EXISTS public.rotation_periods CASCADE;

-- Remove added columns from team_members if they exist
ALTER TABLE public.team_members DROP COLUMN IF EXISTS rotation_period_id;
ALTER TABLE public.team_members DROP COLUMN IF EXISTS position_slot;

-- Create rotation_periods table for trimester configurations
CREATE TABLE public.rotation_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  trimester INTEGER NOT NULL CHECK (trimester >= 1 AND trimester <= 3),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(year, trimester)
);

-- Enable RLS
ALTER TABLE public.rotation_periods ENABLE ROW LEVEL SECURITY;

-- Everyone can view rotation periods
CREATE POLICY "Anyone can view rotation periods"
ON public.rotation_periods
FOR SELECT
USING (true);

-- Only admins can manage rotation periods
CREATE POLICY "Admins can manage rotation periods"
ON public.rotation_periods
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Add rotation_period_id to team_members for trimester-based assignments
ALTER TABLE public.team_members 
ADD COLUMN rotation_period_id UUID REFERENCES public.rotation_periods(id) ON DELETE CASCADE;

-- Add position_slot for specific slot assignments (vocalist_1, eg_1, etc.)
ALTER TABLE public.team_members 
ADD COLUMN position_slot TEXT;

-- Create index for faster lookups
CREATE INDEX idx_team_members_rotation ON public.team_members(rotation_period_id);
CREATE INDEX idx_rotation_periods_active ON public.rotation_periods(is_active);

-- Insert initial rotation periods for 2026
INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active)
VALUES 
  ('T1 2026', 2026, 1, '2026-01-01', '2026-04-30', true),
  ('T2 2026', 2026, 2, '2026-05-01', '2026-08-31', false),
  ('T3 2026', 2026, 3, '2026-09-01', '2026-12-31', false);