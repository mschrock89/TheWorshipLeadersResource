-- Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "Only service role can read tokens" ON pco_connections;

-- Create a proper SELECT policy that allows users to read their own connection
CREATE POLICY "Users can read own connection"
ON pco_connections
FOR SELECT
USING (auth.uid() = user_id);