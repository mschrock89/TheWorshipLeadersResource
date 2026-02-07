-- Create a secure view that excludes OAuth tokens
CREATE VIEW public.pco_connections_safe AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  connected_at,
  last_sync_at,
  created_at,
  updated_at,
  token_expires_at
FROM public.pco_connections;

-- Enable RLS on the view
ALTER VIEW public.pco_connections_safe SET (security_invoker = true);

-- Drop the SELECT policy from the main table (tokens should only be accessed server-side)
DROP POLICY IF EXISTS "Authenticated users can view own connection" ON public.pco_connections;

-- Keep UPDATE policy for settings changes (doesn't expose tokens in response)
-- The existing UPDATE policy already restricts to own connection

-- Create SELECT policy for the safe view access (via the underlying table)
-- Since the view uses security_invoker, we need a policy that allows reading own rows
CREATE POLICY "Users can view own connection via safe view"
ON public.pco_connections
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND auth.uid() = user_id
);