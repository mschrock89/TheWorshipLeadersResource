-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that:
-- 1. Requires authentication
-- 2. Allows users to view their own full profile
-- 3. Allows leaders to view all profiles
-- 4. Allows campus members to view profiles of people they share a campus with
--    (The get_profiles_for_campus RPC handles column masking for sensitive data)
CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL
  AND (
    auth.uid() = id 
    OR has_role(auth.uid(), 'leader'::app_role)
    OR shares_campus_with(auth.uid(), id)
  )
);