ALTER TABLE public.service_time_overrides
ADD COLUMN IF NOT EXISTS ministry_type text;

UPDATE public.service_time_overrides
SET ministry_type = COALESCE(ministry_type, 'weekend')
WHERE ministry_type IS NULL;

ALTER TABLE public.service_time_overrides
ALTER COLUMN ministry_type SET DEFAULT 'weekend';

ALTER TABLE public.service_time_overrides
ALTER COLUMN ministry_type SET NOT NULL;

DROP INDEX IF EXISTS public.idx_service_time_overrides_campus_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_time_overrides_campus_date_ministry
  ON public.service_time_overrides(campus_id, service_date, ministry_type);

CREATE INDEX IF NOT EXISTS idx_service_time_overrides_service_date_ministry
  ON public.service_time_overrides(service_date, ministry_type);
