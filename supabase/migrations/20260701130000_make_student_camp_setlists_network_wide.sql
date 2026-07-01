-- Finish making Student Camp fully Network Wide.
--
-- The earlier migration (20260630150000) moved the *nullable* Student Camp surfaces
-- (team_schedule, camp_instances, events) to network-wide (campus_id / campus_ids = NULL)
-- but explicitly left the NOT NULL surfaces alone:
--   * draft_sets            (saved sets / setlists / song plans)
--   * custom_services       (Student Camp service definitions + service flows)
--   * service_time_overrides
--   * setlist_playlists      (practice playlists generated from published sets)
--
-- This migration does the schema + RLS + data part so those surfaces can also be
-- network-wide. "Network Wide" == campus_id IS NULL. The companion migration
-- 20260701130500 makes the roster/notification RPCs campus-NULL safe.
--
-- Only Student Camp (student_camp / student_camp_morning / student_camp_evening) is
-- moved. Every campus-scoped ministry keeps a concrete campus_id, so the NULL branch
-- added below is purely additive and does not change existing per-campus behavior.

-- ---------------------------------------------------------------------------
-- 1. Allow campus_id to be NULL on the previously campus-locked tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.draft_sets              ALTER COLUMN campus_id DROP NOT NULL;
ALTER TABLE public.custom_services         ALTER COLUMN campus_id DROP NOT NULL;
ALTER TABLE public.service_time_overrides  ALTER COLUMN campus_id DROP NOT NULL;
ALTER TABLE public.setlist_playlists       ALTER COLUMN campus_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. service_time_overrides uniqueness for network-wide rows.
--    The existing unique index (campus_id, service_date, ministry_type) does NOT
--    dedupe network-wide rows because NULL is distinct from NULL in a unique index.
--    Add a partial unique index that keeps one network-wide override per
--    (service_date, ministry_type).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_time_overrides_network_date_ministry
  ON public.service_time_overrides (service_date, ministry_type)
  WHERE campus_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS: make network-wide (campus_id IS NULL) draft sets + their songs visible
--    to every authenticated user, mirroring how network-wide team_schedule/events
--    rows are shared across campuses. Published-set roster visibility is unchanged
--    (still governed by the "Rostered users can view published draft sets" policy
--    and is_user_on_setlist_roster).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view draft sets for their campuses" ON public.draft_sets;
CREATE POLICY "Users can view draft sets for their campuses" ON public.draft_sets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'network_worship_leader'::app_role) OR
  has_role(auth.uid(), 'network_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'student_worship_pastor'::app_role) OR
  has_role(auth.uid(), 'campus_admin'::app_role) OR
  has_role(auth.uid(), 'video_director'::app_role) OR
  has_role(auth.uid(), 'production_manager'::app_role) OR
  campus_id IS NULL OR
  (campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Users can view songs in accessible draft sets" ON public.draft_set_songs;
CREATE POLICY "Users can view songs in accessible draft sets"
ON public.draft_set_songs
FOR SELECT
USING (
  draft_set_id IN (
    SELECT id FROM public.draft_sets
    WHERE has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'campus_admin'::app_role)
      OR campus_id IS NULL
      OR campus_id IN (SELECT uc.campus_id FROM user_campuses uc WHERE uc.user_id = auth.uid())
  )
);

-- ---------------------------------------------------------------------------
-- 4. Keep practice playlists in sync for network-wide published sets too.
--    The original trigger skipped rows where campus_id IS NULL; network-wide
--    Student Camp sets still need a playlist row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_setlist_playlist_for_published_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NOT NULL THEN
    INSERT INTO public.setlist_playlists (draft_set_id, campus_id, service_date, ministry_type)
    VALUES (NEW.id, NEW.campus_id, NEW.plan_date, NEW.ministry_type)
    ON CONFLICT (draft_set_id)
    DO UPDATE SET
      campus_id = EXCLUDED.campus_id,
      service_date = EXCLUDED.service_date,
      ministry_type = EXCLUDED.ministry_type;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill playlists for any already-published network-wide sets that were skipped
-- while campus_id was NOT NULL (defensive; typically none exist yet).
INSERT INTO public.setlist_playlists (draft_set_id, campus_id, service_date, ministry_type)
SELECT ds.id, ds.campus_id, ds.plan_date, ds.ministry_type
FROM public.draft_sets ds
WHERE ds.status = 'published'
  AND ds.published_at IS NOT NULL
ON CONFLICT (draft_set_id)
DO UPDATE SET
  campus_id = EXCLUDED.campus_id,
  service_date = EXCLUDED.service_date,
  ministry_type = EXCLUDED.ministry_type;

-- ---------------------------------------------------------------------------
-- 5. Data migration: move existing Murfreesboro Central Student Camp saved sets,
--    services, and service-time overrides to Network Wide (campus_id = NULL).
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

  -- Saved sets / setlists.
  UPDATE public.draft_sets
     SET campus_id = NULL
   WHERE campus_id = murfreesboro_central_campus_id
     AND ministry_type = ANY (student_camp_ministries);

  -- Practice playlists follow their draft set.
  UPDATE public.setlist_playlists sp
     SET campus_id = NULL
   WHERE sp.campus_id = murfreesboro_central_campus_id
     AND sp.ministry_type = ANY (student_camp_ministries);

  -- Custom service definitions (service flows).
  UPDATE public.custom_services
     SET campus_id = NULL
   WHERE campus_id = murfreesboro_central_campus_id
     AND ministry_type = ANY (student_camp_ministries);

  -- Service time overrides. Clear any pre-existing network-wide duplicates first
  -- so the new partial unique index does not conflict.
  DELETE FROM public.service_time_overrides sto_dupe
   WHERE sto_dupe.campus_id IS NULL
     AND sto_dupe.ministry_type = ANY (student_camp_ministries)
     AND EXISTS (
       SELECT 1
       FROM public.service_time_overrides sto_src
       WHERE sto_src.campus_id = murfreesboro_central_campus_id
         AND sto_src.ministry_type = sto_dupe.ministry_type
         AND sto_src.service_date = sto_dupe.service_date
     );

  UPDATE public.service_time_overrides
     SET campus_id = NULL
   WHERE campus_id = murfreesboro_central_campus_id
     AND ministry_type = ANY (student_camp_ministries);
END $$;
