-- Drop the problematic policy that exposes tokens to all leaders
DROP POLICY IF EXISTS "Leaders can view all connections" ON public.pco_connections;

-- The existing "Users can view own connection" policy is sufficient and secure
-- Each user can only see their own connection with their own tokens