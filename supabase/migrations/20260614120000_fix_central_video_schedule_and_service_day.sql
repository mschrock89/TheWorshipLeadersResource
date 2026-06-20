-- Worship-team production/video volunteers follow the weekend rotation, not a separate
-- offset video schedule. Realign campus-specific video rows and enforce the rule in SQL.

CREATE OR REPLACE FUNCTION public.support_schedule_has_weekend_anchor(
  p_team_id uuid,
  p_schedule_date date,
  p_rotation_period text,
  p_campus_id uuid,
  p_ministry_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    p_ministry_type NOT IN ('production', 'video')
    OR EXISTS (
      SELECT 1
      FROM public.team_schedule ts_anchor
      WHERE ts_anchor.team_id = p_team_id
        AND ts_anchor.schedule_date = p_schedule_date
        AND ts_anchor.rotation_period IS NOT DISTINCT FROM p_rotation_period
        AND (
          ts_anchor.campus_id IS NOT DISTINCT FROM p_campus_id
          OR ts_anchor.campus_id IS NULL
          OR p_campus_id IS NULL
        )
        AND ts_anchor.ministry_type IN ('weekend', 'sunday_am', 'weekend_team')
    );
$$;

-- NOTE: The original version of this (never-applied) migration deleted every
-- campus-specific video schedule row and rebuilt it from the weekend worship rows,
-- forcing video to follow the weekend team. Production/video teams actually rotate
-- on their own Team Builder schedule (e.g. video = Team 1 while weekend = Team 3), so
-- that destructive rebuild has been removed to preserve the authored video schedule.
-- The weekend-anchor gate below is also neutralized in 20260620120000.

CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(
  _user_id uuid,
  _service_date date,
  _campus_id uuid,
  _ministry_type text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH weekend_aliases AS (
    SELECT unnest(ARRAY['weekend','sunday_am','weekend_team']) AS value
  ),
  weekend_support AS (
    SELECT unnest(ARRAY['production','video']) AS value
  )
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    LEFT JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (
        ts.ministry_type = _ministry_type
        OR ts.ministry_type IS NULL
        OR (
          _ministry_type IN (SELECT value FROM weekend_aliases)
          AND ts.ministry_type IN (SELECT value FROM weekend_support)
        )
      )
      AND (
        tm.rotation_period_id IS NULL
        OR (
          rp.campus_id = _campus_id
          AND _service_date BETWEEN rp.start_date AND rp.end_date
        )
      )
      AND (
        tm.ministry_types IS NULL
        OR array_length(tm.ministry_types, 1) IS NULL
        OR _ministry_type = ANY(tm.ministry_types)
        OR (
          _ministry_type IN (SELECT value FROM weekend_aliases)
          AND EXISTS (
            SELECT 1
            FROM unnest(tm.ministry_types) AS member_ministry(value)
            WHERE member_ministry.value IN (SELECT value FROM weekend_support)
          )
        )
      )
      AND (
        tm.service_day IS NULL
        OR tm.service_day IN ('both', 'weekend')
        OR (tm.service_day = 'saturday' AND EXTRACT(DOW FROM _service_date) = 6)
        OR (tm.service_day = 'sunday' AND EXTRACT(DOW FROM _service_date) = 0)
      )
      AND public.support_schedule_has_weekend_anchor(
        tm.team_id,
        ts.schedule_date,
        ts.rotation_period,
        ts.campus_id,
        ts.ministry_type
      )
  )
$$;
