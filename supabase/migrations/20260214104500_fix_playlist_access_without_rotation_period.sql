-- Ensure playlist visibility works for scheduled members even when team_members.rotation_period_id is null.
-- Some production/video members can be scheduled without an active rotation-period row.
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
        -- If no rotation period is linked, treat schedule row as authoritative.
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
  )
$$;
