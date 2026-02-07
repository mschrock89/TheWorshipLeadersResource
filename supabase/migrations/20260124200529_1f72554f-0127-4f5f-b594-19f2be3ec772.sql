-- Security Hardening: Restrict direct profiles table access
-- All profile queries MUST go through secure RPC functions that implement field-level masking

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view own profile or same-campus authorized" ON public.profiles;

-- Create a restrictive policy: users can only directly SELECT their own profile
-- All other access must go through get_profiles_for_campus, get_profile_safe, or get_basic_profiles
CREATE POLICY "Users can only view their own profile directly"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Admins still need direct access for management purposes
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));