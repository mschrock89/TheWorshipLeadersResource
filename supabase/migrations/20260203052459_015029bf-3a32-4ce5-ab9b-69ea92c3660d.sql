
-- Update is_scheduled_for_service to also check for accepted swap/cover requests
-- If a user has accepted a swap/cover for a date, they should be considered scheduled
CREATE OR REPLACE FUNCTION public.is_scheduled_for_service(_user_id uuid, _service_date date, _campus_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    -- Check original team schedule assignment
    SELECT 1
    FROM team_members tm
    JOIN team_schedule ts ON tm.team_id = ts.team_id
    JOIN rotation_periods rp ON tm.rotation_period_id = rp.id
    WHERE tm.user_id = _user_id
      AND ts.schedule_date = _service_date
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
      AND rp.campus_id = _campus_id
      AND _service_date BETWEEN rp.start_date AND rp.end_date
      AND (tm.ministry_types IS NULL OR _ministry_type = ANY(tm.ministry_types))
  )
  OR EXISTS (
    -- Check if user accepted a swap/cover for this date
    SELECT 1
    FROM swap_requests sr
    JOIN worship_teams wt ON sr.team_id = wt.id
    JOIN team_schedule ts ON ts.team_id = sr.team_id AND ts.schedule_date = sr.original_date
    WHERE sr.accepted_by_id = _user_id
      AND sr.original_date = _service_date
      AND sr.status = 'accepted'
      AND (ts.campus_id IS NULL OR ts.campus_id = _campus_id)
      AND (ts.ministry_type = _ministry_type OR ts.ministry_type IS NULL)
  )
$$;
