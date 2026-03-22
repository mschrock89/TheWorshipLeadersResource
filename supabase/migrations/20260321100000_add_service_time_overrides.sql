CREATE TABLE IF NOT EXISTS public.service_time_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_times TIME[] NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_time_overrides_service_times_check
    CHECK (cardinality(service_times) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_time_overrides_campus_date
  ON public.service_time_overrides(campus_id, service_date);

CREATE INDEX IF NOT EXISTS idx_service_time_overrides_service_date
  ON public.service_time_overrides(service_date);

ALTER TABLE public.service_time_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view service time overrides" ON public.service_time_overrides;
CREATE POLICY "Authenticated users can view service time overrides"
ON public.service_time_overrides
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leaders can manage service time overrides" ON public.service_time_overrides;
CREATE POLICY "Leaders can manage service time overrides"
ON public.service_time_overrides
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

DROP TRIGGER IF EXISTS update_service_time_overrides_updated_at ON public.service_time_overrides;
CREATE TRIGGER update_service_time_overrides_updated_at
BEFORE UPDATE ON public.service_time_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
