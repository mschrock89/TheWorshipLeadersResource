-- Add Prayer Night ministry support for existing custom services and linked set data.
-- This reclassifies legacy "Prayer Night" custom services that were created as weekend ministry.

WITH prayer_services AS (
  SELECT id
  FROM public.custom_services
  WHERE lower(service_name) LIKE '%prayer night%'
)
UPDATE public.custom_services
SET ministry_type = 'prayer_night'
WHERE id IN (SELECT id FROM prayer_services)
  AND ministry_type <> 'prayer_night';

WITH prayer_services AS (
  SELECT id
  FROM public.custom_services
  WHERE lower(service_name) LIKE '%prayer night%'
)
UPDATE public.draft_sets
SET ministry_type = 'prayer_night'
WHERE custom_service_id IN (SELECT id FROM prayer_services)
  AND ministry_type <> 'prayer_night';

UPDATE public.setlist_playlists sp
SET ministry_type = 'prayer_night'
WHERE EXISTS (
  SELECT 1
  FROM public.draft_sets ds
  WHERE ds.id = sp.draft_set_id
    AND ds.ministry_type = 'prayer_night'
    AND ds.custom_service_id IS NOT NULL
)
AND sp.ministry_type <> 'prayer_night';
