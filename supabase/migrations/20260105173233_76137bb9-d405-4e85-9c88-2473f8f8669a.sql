-- Drop the problematic policy we just created
DROP POLICY IF EXISTS "Campus members can view basic profiles" ON public.profiles;

-- The "Users can view profiles" policy is now correctly restrictive:
-- Only allows:
-- 1. Users viewing their own profile
-- 2. Leaders viewing any profile
-- 
-- Campus members MUST use the get_profiles_for_campus RPC function
-- which is a SECURITY DEFINER function that masks sensitive data
-- based on consent flags. This is the correct approach since
-- RLS cannot mask individual columns.