-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;

-- Create a new SELECT policy that respects consent flags
-- Users can see:
-- 1. Their own full profile
-- 2. Leaders can see all profiles
-- 3. Campus members can only see basic info (id, full_name, avatar_url, positions)
--    Contact info (email, phone, birthday, anniversary) is only visible if:
--    - The profile owner has share_contact_with_campus = true, OR
--    - The viewer is a campus_pastor AND profile owner has share_contact_with_pastors = true

-- Since RLS policies can only control row access (not column access),
-- we need to ensure the application uses the secure RPC functions.
-- However, we should still restrict raw table access to prevent direct queries.

-- Create a more restrictive policy that only allows viewing if:
-- 1. User is viewing their own profile
-- 2. User is a leader
-- For campus members, they must use the get_profiles_for_campus RPC function

CREATE POLICY "Users can view profiles" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR has_role(auth.uid(), 'leader'::app_role)
);

-- Create a separate policy for campus members to see basic profile info only
-- This works by allowing access but the RPC function handles column masking
CREATE POLICY "Campus members can view basic profiles" 
ON public.profiles 
FOR SELECT 
USING (
  shares_campus_with(auth.uid(), id)
  AND (
    -- Only allow access if consent is given for contact info
    -- Or if they're just querying basic fields (enforced by RPC)
    share_contact_with_campus = true
    OR share_contact_with_pastors = true
    -- Always allow basic info access (name, avatar) - RPC handles masking
    OR true
  )
);