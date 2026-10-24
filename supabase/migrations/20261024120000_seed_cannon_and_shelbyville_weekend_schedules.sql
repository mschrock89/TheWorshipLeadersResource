-- Cannon County's weekend rotation matches Murfreesboro Central through
-- April 2026 and then stops. Shelbyville has no weekend schedule rows.
-- Copy Central's weekend team for each later date so both campuses follow
-- the same rotation. Shelbyville meets on Sunday only.

INSERT INTO public.team_schedule (
  campus_id,
  schedule_date,
  team_id,
  ministry_type,
  time_of_day,
  rotation_period,
  notes,
  resource_app_key
)
SELECT
  target.id,
  source.schedule_date,
  source.team_id,
  source.ministry_type,
  source.time_of_day,
  source.rotation_period,
  source.notes,
  source.resource_app_key
FROM public.team_schedule source
JOIN public.campuses central
  ON central.id = source.campus_id
 AND central.name = 'Murfreesboro Central'
JOIN public.campuses target
  ON target.name IN ('Cannon County', 'Shelbyville')
WHERE source.ministry_type IN ('weekend', 'sunday_am')
  AND source.schedule_date >= '2026-05-01'
  AND (
    target.name = 'Cannon County'
    OR EXTRACT(DOW FROM source.schedule_date) = 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_schedule existing
    WHERE existing.campus_id = target.id
      AND existing.schedule_date = source.schedule_date
      AND existing.ministry_type = source.ministry_type
      AND existing.resource_app_key IS NOT DISTINCT FROM source.resource_app_key
  );
