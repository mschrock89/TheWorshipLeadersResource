-- Production/video teams rotate on their own schedule in Team Builder, independent of
-- the weekend worship team for a given date (e.g. at Murfreesboro Central the video team
-- can be Team 1 while weekend worship is Team 3). The weekend-anchor requirement added in
-- 20260614120000 discarded those legitimate support rows, so rosters fell back to the
-- weekend worship team's video members instead of the scheduled video team.
--
-- Honor the support schedule row exactly as authored. Keeping the function (instead of
-- editing every dependent RPC) preserves is_scheduled_for_service, is_user_on_setlist_roster
-- and get_setlist_notifiable_user_ids while removing the anchor gate they call into.
CREATE OR REPLACE FUNCTION public.support_schedule_has_weekend_anchor(
  p_team_id uuid,
  p_schedule_date date,
  p_rotation_period text,
  p_campus_id uuid,
  p_ministry_type text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT true;
$$;
