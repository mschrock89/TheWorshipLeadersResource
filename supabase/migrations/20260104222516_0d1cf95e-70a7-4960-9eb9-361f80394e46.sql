-- Drop the overly permissive policy that exposes all profiles to any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view profiles for chat" ON public.profiles;

-- Create a more restrictive policy: users can only view profiles of people in their campus
CREATE POLICY "Users can view campus member profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() = id  -- Own profile
  OR shares_campus_with(auth.uid(), id)  -- Same campus members
  OR has_role(auth.uid(), 'leader'::app_role)  -- Leaders can see all
);