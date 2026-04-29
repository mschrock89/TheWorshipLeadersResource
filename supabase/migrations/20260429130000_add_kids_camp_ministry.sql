-- Add Kids Camp ministry support for legacy custom services and linked set data.
-- This reclassifies existing "Kids Camp" services that were previously stored as weekend ministry.

WITH kids_camp_services AS (
  SELECT id
  FROM public.custom_services
  WHERE lower(service_name) LIKE '%kids camp%'
)
UPDATE public.custom_services
SET ministry_type = 'kids_camp'
WHERE id IN (SELECT id FROM kids_camp_services)
  AND ministry_type <> 'kids_camp';

WITH kids_camp_services AS (
  SELECT id
  FROM public.custom_services
  WHERE lower(service_name) LIKE '%kids camp%'
)
UPDATE public.draft_sets
SET ministry_type = 'kids_camp'
WHERE custom_service_id IN (SELECT id FROM kids_camp_services)
  AND ministry_type <> 'kids_camp';

UPDATE public.setlist_playlists sp
SET ministry_type = 'kids_camp'
WHERE EXISTS (
  SELECT 1
  FROM public.draft_sets ds
  WHERE ds.id = sp.draft_set_id
    AND ds.ministry_type = 'kids_camp'
    AND ds.custom_service_id IS NOT NULL
)
AND sp.ministry_type <> 'kids_camp';

WITH kids_camp_services AS (
  SELECT id
  FROM public.custom_services
  WHERE lower(service_name) LIKE '%kids camp%'
)
UPDATE public.service_flows
SET ministry_type = 'kids_camp'
WHERE custom_service_id IN (SELECT id FROM kids_camp_services)
  AND ministry_type <> 'kids_camp';
