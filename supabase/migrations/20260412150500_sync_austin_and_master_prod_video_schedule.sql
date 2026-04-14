-- Ensure Austin Kursave has the intended Team Builder access and
-- mirror the shared weekend master schedule to Production and Video.

DO $$
DECLARE
  austin_user_id uuid := '15d51692-de14-4c97-ae1b-a23fa264735d';
  murfreesboro_central_campus_id uuid := 'd70b980c-27a4-43b5-800b-1c58899ece90';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = austin_user_id
      AND role = 'production_manager'
  ) THEN
    INSERT INTO public.user_roles (id, user_id, role, admin_campus_id)
    VALUES (gen_random_uuid(), austin_user_id, 'production_manager', NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = austin_user_id
      AND role = 'campus_admin'
      AND admin_campus_id = murfreesboro_central_campus_id
  ) THEN
    INSERT INTO public.user_roles (id, user_id, role, admin_campus_id)
    VALUES (gen_random_uuid(), austin_user_id, 'campus_admin', murfreesboro_central_campus_id);
  END IF;
END $$;

INSERT INTO public.team_schedule (
  id,
  team_id,
  schedule_date,
  rotation_period,
  notes,
  ministry_type,
  campus_id
)
SELECT
  gen_random_uuid(),
  source.team_id,
  source.schedule_date,
  source.rotation_period,
  source.notes,
  target.ministry_type,
  source.campus_id
FROM public.team_schedule AS source
CROSS JOIN (
  VALUES ('production'::text), ('video'::text)
) AS target(ministry_type)
WHERE source.campus_id IS NULL
  AND source.ministry_type = 'weekend'
  AND NOT EXISTS (
    SELECT 1
    FROM public.team_schedule AS existing
    WHERE existing.campus_id IS NOT DISTINCT FROM source.campus_id
      AND existing.schedule_date = source.schedule_date
      AND existing.rotation_period = source.rotation_period
      AND existing.ministry_type = target.ministry_type
  );
