CREATE TABLE IF NOT EXISTS public.custom_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  repeats_weekly BOOLEAN NOT NULL DEFAULT false,
  repeat_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT custom_services_repeat_until_check
    CHECK (repeat_until IS NULL OR repeat_until >= service_date)
);

CREATE INDEX IF NOT EXISTS idx_custom_services_campus_ministry_date
  ON public.custom_services(campus_id, ministry_type, service_date);

CREATE INDEX IF NOT EXISTS idx_custom_services_active
  ON public.custom_services(is_active, service_date);

ALTER TABLE public.custom_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view custom services" ON public.custom_services;
CREATE POLICY "Authenticated users can view custom services"
ON public.custom_services
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Leaders can manage custom services" ON public.custom_services;
CREATE POLICY "Leaders can manage custom services"
ON public.custom_services
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

DROP TRIGGER IF EXISTS update_custom_services_updated_at ON public.custom_services;
CREATE TRIGGER update_custom_services_updated_at
BEFORE UPDATE ON public.custom_services
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
