CREATE TABLE IF NOT EXISTS public.custom_service_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_service_id UUID NOT NULL REFERENCES public.custom_services(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role team_position NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(custom_service_id, assignment_date, user_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_service_assignments_service_date
  ON public.custom_service_assignments(custom_service_id, assignment_date);

CREATE INDEX IF NOT EXISTS idx_custom_service_assignments_user_date
  ON public.custom_service_assignments(user_id, assignment_date);

ALTER TABLE public.custom_service_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view custom service assignments" ON public.custom_service_assignments;
CREATE POLICY "Authenticated users can view custom service assignments"
ON public.custom_service_assignments
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leaders can manage custom service assignments" ON public.custom_service_assignments;
CREATE POLICY "Leaders can manage custom service assignments"
ON public.custom_service_assignments
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'network_worship_leader'::app_role)
);
