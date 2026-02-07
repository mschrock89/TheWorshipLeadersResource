-- Drop the existing view and recreate with proper security
DROP VIEW IF EXISTS public.pco_connections_safe;

-- Create the view with SECURITY DEFINER to bypass RLS on underlying table
-- Access control is built into the view's WHERE clause
CREATE VIEW public.pco_connections_safe 
WITH (security_invoker = false)
AS
SELECT 
  id,
  user_id,
  campus_id,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  connected_at,
  last_sync_at,
  created_at,
  updated_at,
  token_expires_at,
  pco_organization_name
FROM public.pco_connections
WHERE 
  -- Only show own connection or if user is a leader
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'leader'::app_role);

-- Grant access to authenticated users (view handles its own access control)
GRANT SELECT ON public.pco_connections_safe TO authenticated;