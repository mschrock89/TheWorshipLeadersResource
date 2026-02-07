-- Add policy requiring authentication for profiles table
-- This prevents unauthenticated users from accessing any profile data
CREATE POLICY "Require authentication for profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);