-- Drop the SECURITY DEFINER view and recreate with proper RLS
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create the view without SECURITY DEFINER (inherits caller's permissions)
CREATE VIEW public.pco_connections_safe WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections;

-- Grant access to the safe view
GRANT SELECT ON public.pco_connections_safe TO authenticated;