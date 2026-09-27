-- T3 2026 (and any later period in the same state) has Weekend Worship
-- schedule rows but no Production rows. Production volunteers only match
-- ministry_type = 'production', so My Schedule and Calendar stayed empty
-- even though Team Builder was displaying the weekend rotation as Production.
--
-- Copy the weekend rotation into Production for any period that has weekend
-- rows and zero production rows. Periods that already have a Production
-- schedule (T1/T2) are left alone.

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
  weekend.campus_id,
  weekend.schedule_date,
  weekend.team_id,
  'production',
  weekend.time_of_day,
  weekend.rotation_period,
  weekend.notes,
  weekend.resource_app_key
FROM public.team_schedule weekend
WHERE weekend.ministry_type IN ('weekend', 'sunday_am')
  AND weekend.rotation_period IN (
    SELECT rotation_period
    FROM public.team_schedule
    GROUP BY rotation_period
    HAVING bool_or(ministry_type IN ('weekend', 'sunday_am'))
       AND NOT bool_or(ministry_type = 'production')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_schedule production
    WHERE production.ministry_type = 'production'
      AND production.schedule_date = weekend.schedule_date
      AND production.resource_app_key IS NOT DISTINCT FROM weekend.resource_app_key
      AND production.rotation_period IS NOT DISTINCT FROM weekend.rotation_period
      AND production.team_id = weekend.team_id
      AND production.campus_id IS NOT DISTINCT FROM weekend.campus_id
      AND production.time_of_day IS NOT DISTINCT FROM weekend.time_of_day
  );
