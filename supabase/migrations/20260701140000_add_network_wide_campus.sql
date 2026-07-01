-- Add a "Network Wide" pseudo-campus.
--
-- Unlike the campus_id = NULL convention used for network-wide schedules/sets/events,
-- this is a REAL row in public.campuses flagged is_network_wide = true. Using a real
-- row lets the existing FK-backed, NOT NULL assignment tables (user_campuses,
-- user_ministry_campuses, user_campus_ministry_positions) attach people to camp-family
-- ministries (Student Camp, Kids Camp) without a schema change.
--
-- The app hides this row from every campus-selection surface (Default Campus, Calendar
-- filters, Team Builder campus dropdown, service-time config) and only surfaces it in
-- Campus Assignments + the Ministries-by-Campus card, and resolves camp-family ministry
-- eligibility in Team Builder to it.

-- 1. Flag column
ALTER TABLE public.campuses
  ADD COLUMN IF NOT EXISTS is_network_wide boolean NOT NULL DEFAULT false;

-- 2. Sentinel row + assignment migration
DO $$
DECLARE
  network_wide_campus_id uuid;
  camp_ministries text[] := ARRAY[
    'student_camp', 'student_camp_morning', 'student_camp_evening',
    'kids_camp', 'kids_camp_morning', 'kids_camp_afternoon'
  ];
BEGIN
  -- Create (or reuse) the single Network Wide sentinel campus. It intentionally has no
  -- Saturday/Sunday services so weekend/service-time logic ignores it.
  INSERT INTO public.campuses (name, is_network_wide, has_saturday_service, has_sunday_service)
  VALUES ('Network Wide', true, false, false)
  ON CONFLICT (name) DO UPDATE SET is_network_wide = true;

  SELECT id INTO network_wide_campus_id
    FROM public.campuses
   WHERE name = 'Network Wide'
   LIMIT 1;

  IF network_wide_campus_id IS NULL THEN
    RAISE NOTICE 'Network Wide campus not found after insert; skipping migration.';
    RETURN;
  END IF;

  -----------------------------------------------------------------------------
  -- 3. Move existing camp-family ministry assignments to the Network Wide campus.
  --    Insert conflict-safe copies keyed on the sentinel campus, then delete the
  --    old per-campus rows for those ministry types.
  -----------------------------------------------------------------------------

  -- user_ministry_campuses (UNIQUE(user_id, campus_id, ministry_type))
  INSERT INTO public.user_ministry_campuses (user_id, campus_id, ministry_type)
  SELECT DISTINCT umc.user_id, network_wide_campus_id, umc.ministry_type
    FROM public.user_ministry_campuses umc
   WHERE umc.campus_id <> network_wide_campus_id
     AND umc.ministry_type = ANY (camp_ministries)
  ON CONFLICT (user_id, campus_id, ministry_type) DO NOTHING;

  DELETE FROM public.user_ministry_campuses
   WHERE campus_id <> network_wide_campus_id
     AND ministry_type = ANY (camp_ministries);

  -- user_campus_ministry_positions (UNIQUE(user_id, campus_id, ministry_type, position))
  INSERT INTO public.user_campus_ministry_positions (user_id, campus_id, ministry_type, position)
  SELECT DISTINCT ucmp.user_id, network_wide_campus_id, ucmp.ministry_type, ucmp.position
    FROM public.user_campus_ministry_positions ucmp
   WHERE ucmp.campus_id <> network_wide_campus_id
     AND ucmp.ministry_type = ANY (camp_ministries)
  ON CONFLICT (user_id, campus_id, ministry_type, position) DO NOTHING;

  DELETE FROM public.user_campus_ministry_positions
   WHERE campus_id <> network_wide_campus_id
     AND ministry_type = ANY (camp_ministries);

  -- user_campuses: ensure everyone who now has a Network Wide ministry/position is a
  -- member of the Network Wide campus so the Profile card renders for them.
  INSERT INTO public.user_campuses (user_id, campus_id)
  SELECT DISTINCT user_id, network_wide_campus_id
    FROM (
      SELECT user_id FROM public.user_ministry_campuses WHERE campus_id = network_wide_campus_id
      UNION
      SELECT user_id FROM public.user_campus_ministry_positions WHERE campus_id = network_wide_campus_id
    ) affected
  ON CONFLICT (user_id, campus_id) DO NOTHING;
END $$;
