
-- Fix is_scheduled_for_service to handle NULL campus_id in team_schedule (shared teams)
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id uuid, _service_date date, _campus_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      -- Allow NULL campus_id in team_schedule (shared teams) or exact match
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      -- User's rotation period must match the campus
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
$$;
