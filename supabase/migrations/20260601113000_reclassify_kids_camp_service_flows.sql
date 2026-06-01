-- Reclassify legacy Kids Camp custom-service flows that were generated as weekend flows.
-- This lets scoped lookups find them through /service-flow?ministry=kids_camp&customServiceId=...

UPDATE public.service_flows sf
SET ministry_type = 'kids_camp'
FROM public.custom_services cs
WHERE sf.custom_service_id = cs.id
  AND sf.ministry_type <> 'kids_camp'
  AND (
    cs.ministry_type = 'kids_camp'
    OR cs.service_name ~* '\mkids\s*camp\M'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_flows existing
    WHERE existing.id <> sf.id
      AND existing.campus_id = sf.campus_id
      AND existing.ministry_type = 'kids_camp'
      AND existing.service_date = sf.service_date
      AND existing.custom_service_id = sf.custom_service_id
  );

UPDATE public.service_flows sf
SET ministry_type = 'kids_camp'
FROM public.draft_sets ds
LEFT JOIN public.custom_services cs ON cs.id = ds.custom_service_id
WHERE sf.draft_set_id = ds.id
  AND sf.ministry_type <> 'kids_camp'
  AND (
    ds.ministry_type = 'kids_camp'
    OR cs.ministry_type = 'kids_camp'
    OR cs.service_name ~* '\mkids\s*camp\M'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.service_flows existing
    WHERE existing.id <> sf.id
      AND existing.campus_id = sf.campus_id
      AND existing.ministry_type = 'kids_camp'
      AND existing.service_date = sf.service_date
      AND existing.custom_service_id = sf.custom_service_id
  );
