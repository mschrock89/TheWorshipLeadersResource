-- Recurring service days and times for each campus and ministry.
-- Weekend Services stay mirrored onto campuses.saturday/sunday columns so
-- existing weekend readers keep working.

CREATE TABLE public.campus_ministry_service_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  ministry_type text NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  service_times text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus_id, ministry_type, day_of_week)
);

CREATE INDEX campus_ministry_service_schedules_campus_ministry_idx
  ON public.campus_ministry_service_schedules (campus_id, ministry_type);

INSERT INTO public.campus_ministry_service_schedules (campus_id, ministry_type, day_of_week, service_times)
SELECT id, 'weekend', 6, saturday_service_time
FROM public.campuses
WHERE is_network_wide = false
  AND has_saturday_service = true
  AND saturday_service_time IS NOT NULL
  AND cardinality(saturday_service_time) > 0;

INSERT INTO public.campus_ministry_service_schedules (campus_id, ministry_type, day_of_week, service_times)
SELECT id, 'weekend', 0, sunday_service_time
FROM public.campuses
WHERE is_network_wide = false
  AND has_sunday_service IS DISTINCT FROM false
  AND sunday_service_time IS NOT NULL
  AND cardinality(sunday_service_time) > 0;

ALTER TABLE public.campus_ministry_service_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view campus ministry service schedules"
ON public.campus_ministry_service_schedules
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage campus ministry service schedules"
ON public.campus_ministry_service_schedules
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_campus_ministry_service_schedules_updated_at
  ON public.campus_ministry_service_schedules;
CREATE TRIGGER update_campus_ministry_service_schedules_updated_at
BEFORE UPDATE ON public.campus_ministry_service_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
