-- Add campus_pastor to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'campus_pastor';

-- Create campuses table
CREATE TABLE public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on campuses
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view campuses
CREATE POLICY "Users can view campuses" ON public.campuses
  FOR SELECT TO authenticated USING (true);

-- Leaders can manage campuses
CREATE POLICY "Leaders can manage campuses" ON public.campuses
  FOR ALL USING (has_role(auth.uid(), 'leader'::app_role));

-- Create user_campuses junction table
CREATE TABLE public.user_campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, campus_id)
);

-- Enable RLS on user_campuses
ALTER TABLE public.user_campuses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view campus assignments
CREATE POLICY "Users can view campus assignments" ON public.user_campuses
  FOR SELECT TO authenticated USING (true);

-- Leaders can manage all campus assignments
CREATE POLICY "Leaders can manage campus assignments" ON public.user_campuses
  FOR ALL USING (has_role(auth.uid(), 'leader'::app_role));