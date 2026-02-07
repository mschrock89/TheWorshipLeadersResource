-- Enable RLS on the pco_connections_safe view
ALTER VIEW public.pco_connections_safe SET (security_invoker = true);

-- Since views with security_invoker inherit RLS from base tables, 
-- but the scanner wants explicit policies, let's ensure the base table policy is tight
-- and recreate the view to only show user's own data

DROP VIEW IF EXISTS public.pco_connections_safe;

CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = true)
AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_positions,
  sync_birthdays,
  sync_phone_numbers,
  sync_active_only
FROM public.pco_connections
WHERE user_id = auth.uid();

-- Grant appropriate permissions
GRANT SELECT ON public.pco_connections_safe TO authenticated;