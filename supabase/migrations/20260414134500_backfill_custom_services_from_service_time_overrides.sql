INSERT INTO public.custom_services (
  campus_id,
  ministry_type,
  service_name,
  service_date,
  start_time,
  repeats_weekly,
  is_active,
  created_by
)
SELECT
  sto.campus_id,
  sto.ministry_type,
  CASE sto.ministry_type
    WHEN 'worship_night' THEN 'Worship Night'
    WHEN 'encounter' THEN 'Encounter'
    WHEN 'eon' THEN 'EON'
    WHEN 'eon_weekend' THEN 'EON Weekend'
    WHEN 'evident' THEN 'Evident Life'
    WHEN 'er' THEN 'ER'
    WHEN 'prayer_night' THEN 'Prayer Night'
    WHEN 'speaker' THEN 'Speaker'
    WHEN 'production' THEN 'Production'
    WHEN 'video' THEN 'Video'
    ELSE initcap(replace(sto.ministry_type, '_', ' '))
  END AS service_name,
  sto.service_date,
  service_time,
  false,
  true,
  sto.created_by
FROM public.service_time_overrides sto
CROSS JOIN LATERAL unnest(sto.service_times) AS service_time
WHERE sto.ministry_type NOT IN ('weekend', 'sunday_am', 'weekend_team')
  AND NOT EXISTS (
    SELECT 1
    FROM public.custom_services cs
    WHERE cs.campus_id = sto.campus_id
      AND cs.service_date = sto.service_date
      AND cs.ministry_type = sto.ministry_type
      AND coalesce(cs.start_time::text, '') = service_time::text
      AND cs.is_active = true
  );
