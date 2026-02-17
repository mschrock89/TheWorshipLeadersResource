-- Allow distinct service flows for multiple custom services on the same campus/ministry/date.
-- This is required for scenarios like Prayer Night + Prayer Night (Mayday).

ALTER TABLE public.service_flows
  ADD COLUMN IF NOT EXISTS custom_service_id UUID REFERENCES public.custom_services(id) ON DELETE SET NULL;

-- Backfill custom service link from draft_sets where available.
UPDATE public.service_flows sf
SET custom_service_id = ds.custom_service_id
FROM public.draft_sets ds
WHERE sf.draft_set_id = ds.id
  AND sf.custom_service_id IS NULL
  AND ds.custom_service_id IS NOT NULL;

-- Replace legacy uniqueness with scoped uniqueness:
-- 1) Standard services (no custom_service_id): one flow per campus/ministry/date.
-- 2) Custom services: one flow per campus/ministry/date/custom_service_id.
ALTER TABLE public.service_flows
  DROP CONSTRAINT IF EXISTS service_flows_campus_id_ministry_type_service_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS service_flows_standard_unique_idx
  ON public.service_flows (campus_id, ministry_type, service_date)
  WHERE custom_service_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_flows_custom_unique_idx
  ON public.service_flows (campus_id, ministry_type, service_date, custom_service_id)
  WHERE custom_service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_service_flows_custom_service
  ON public.service_flows (custom_service_id);

-- Reclassify linked custom-service flows to prayer_night after scoped uniqueness is in place.
UPDATE public.service_flows sf
SET ministry_type = 'prayer_night'
FROM public.draft_sets ds
WHERE sf.draft_set_id = ds.id
  AND ds.ministry_type = 'prayer_night'
  AND sf.ministry_type <> 'prayer_night';
