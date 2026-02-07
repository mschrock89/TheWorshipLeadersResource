-- Remove the SELECT policy that exposes tokens to users
DROP POLICY IF EXISTS "Users can view own connection via safe view" ON public.pco_connections;

-- Create a new SELECT policy that only allows service role access (edge functions)
-- Users should use the pco_connections_safe view instead
CREATE POLICY "Only service role can read tokens"
ON public.pco_connections
FOR SELECT
USING (false);

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.pco_connections_safe TO authenticated;