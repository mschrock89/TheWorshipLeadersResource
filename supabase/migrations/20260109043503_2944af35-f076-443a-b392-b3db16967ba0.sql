-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view rotation periods" ON public.rotation_periods;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can view rotation periods"
ON public.rotation_periods
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);