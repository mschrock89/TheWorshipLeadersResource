-- Recreate view with security invoker (default, safer)
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only,
  connected_at,
  last_sync_at
FROM public.pco_connections;