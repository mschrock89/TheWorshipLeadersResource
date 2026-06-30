-- Move "everything Student Camp" from being scoped to the Murfreesboro Central
-- campus to being Network Wide (shared across every campus).
--
-- "Network Wide" in this app is represented as campus_id = NULL (for tables whose
-- campus_id is nullable) or campus_ids = NULL (for camp_instances, where NULL means
-- "all campuses"). There is no campus row literally named "Network Wide".
--
-- IMPORTANT SCOPE NOTE -------------------------------------------------------
-- This migration only touches surfaces whose campus column is NULLABLE:
--   * team_schedule        (which team plays each Student Camp day)
--   * camp_instances       (Camp Mode info / feed / chat / pings config)
--   * events               (Student Camp calendar events)
--
-- The following Student Camp surfaces have a NOT NULL campus_id and CANNOT be made
-- network-wide by data alone -- every read path, RLS policy, and roster/notification
-- RPC assumes a concrete campus, so nulling them would make the rows disappear and
-- break confirmations/notifications. Making these network-wide is a schema + app +
-- RLS change, not a data migration, so they are intentionally LEFT UNCHANGED here:
--   * draft_sets           (setlists / song plans)
--   * custom_services      (Student Camp service definitions + service flows)
--   * service_time_overrides
--
-- chat_messages is also intentionally left alone: nulling campus_id would merge
-- separate campuses' historical Student Camp chat into one globally visible feed.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  murfreesboro_central_campus_id uuid;
  student_camp_ministries text[] := ARRAY[
    'student_camp', 'student_camp_morning', 'student_camp_evening'
  ];
BEGIN
  SELECT id
    INTO murfreesboro_central_campus_id
    FROM public.campuses
   WHERE name = 'Murfreesboro Central'
   LIMIT 1;

  IF murfreesboro_central_campus_id IS NULL THEN
    RAISE NOTICE 'Murfreesboro Central campus not found; nothing to migrate.';
    RETURN;
  END IF;

  -------------------------------------------------------------------------
  -- 1. Team schedule: make Murfreesboro Central's Student Camp schedule the
  --    network-wide (shared) baseline. Other campuses keep any campus-specific
  --    Student Camp rows they have, which still override the shared baseline in
  --    the read layer.
  -------------------------------------------------------------------------

  -- Clear any stale pre-existing network-wide Student Camp rows so we don't end
  -- up with conflicting shared baselines for the same date.
  DELETE FROM public.team_schedule
   WHERE campus_id IS NULL
     AND ministry_type = ANY (student_camp_ministries);

  UPDATE public.team_schedule
     SET campus_id = NULL
   WHERE campus_id = murfreesboro_central_campus_id
     AND ministry_type = ANY (student_camp_ministries);

  -------------------------------------------------------------------------
  -- 2. Camp Mode: make Student Camp camp instances span all campuses.
  --    campus_ids = NULL is the canonical "all campuses" value (see useCampMode).
  -------------------------------------------------------------------------

  UPDATE public.camp_instances
     SET campus_ids = NULL
   WHERE base_ministry_type = 'student_camp'
     AND campus_ids IS NOT NULL
     AND (
       campus_ids = ARRAY[murfreesboro_central_campus_id]
       OR murfreesboro_central_campus_id = ANY (campus_ids)
     );

  -------------------------------------------------------------------------
  -- 3. Calendar events: make Murfreesboro Central's Student Camp events
  --    network-wide (campus_id NULL is already treated as "visible to all" by
  --    the events SELECT policy). Also clear any single-campus campus_ids list
  --    that only contained Murfreesboro Central.
  -------------------------------------------------------------------------

  UPDATE public.events
     SET campus_id = NULL
   WHERE campus_id = murfreesboro_central_campus_id
     AND (
       ministry_type = ANY (student_camp_ministries)
       OR ministry_types && student_camp_ministries
     );

  UPDATE public.events
     SET campus_ids = NULL
   WHERE campus_ids = ARRAY[murfreesboro_central_campus_id]
     AND (
       ministry_type = ANY (student_camp_ministries)
       OR ministry_types && student_camp_ministries
     );
END $$;
