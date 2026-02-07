-- Add campus_id to rotation_periods for per-campus team building
ALTER TABLE public.rotation_periods 
ADD COLUMN campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE;

-- Update the unique constraint to be per campus
ALTER TABLE public.rotation_periods DROP CONSTRAINT IF EXISTS rotation_periods_year_trimester_key;
ALTER TABLE public.rotation_periods ADD CONSTRAINT rotation_periods_year_trimester_campus_key UNIQUE(year, trimester, campus_id);

-- Create index for faster campus lookups
CREATE INDEX idx_rotation_periods_campus ON public.rotation_periods(campus_id);

-- Update RLS to allow campus admins to manage their campus rotation periods
DROP POLICY IF EXISTS "Admins can manage rotation periods" ON public.rotation_periods;

CREATE POLICY "Admins can manage rotation periods"
ON public.rotation_periods
FOR ALL
USING (
  has_role(auth.uid(), 'admin') OR 
  (has_role(auth.uid(), 'campus_admin') AND campus_id IN (
    SELECT admin_campus_id FROM user_roles WHERE user_id = auth.uid() AND role = 'campus_admin'
  ))
);

-- Insert rotation periods for each campus (Murfreesboro Central)
INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T1 2026', 2026, 1, '2026-01-01', '2026-04-30', true, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;

INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T2 2026', 2026, 2, '2026-05-01', '2026-08-31', false, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;

INSERT INTO public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
SELECT 
  'T3 2026', 2026, 3, '2026-09-01', '2026-12-31', false, id
FROM campuses WHERE name = 'Murfreesboro Central'
ON CONFLICT (year, trimester, campus_id) DO NOTHING;