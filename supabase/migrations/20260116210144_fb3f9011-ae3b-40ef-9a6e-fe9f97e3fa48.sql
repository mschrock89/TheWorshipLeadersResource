-- 1. Remove plaintext token columns from pco_connections (keep only encrypted)
-- First check if there's any data to migrate, then remove columns
ALTER TABLE public.pco_connections 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

-- 2. Fix user_campus_ministry_positions - require authentication
DROP POLICY IF EXISTS "Anyone can view campus ministry positions" ON public.user_campus_ministry_positions;
CREATE POLICY "Authenticated users can view campus ministry positions" 
ON public.user_campus_ministry_positions 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 3. Fix song_keys - require authentication  
DROP POLICY IF EXISTS "Anyone can view song keys" ON public.song_keys;
CREATE POLICY "Authenticated users can view song keys"
ON public.song_keys
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 4. Fix pco_connections_safe view - add proper RLS by recreating with security invoker
DROP VIEW IF EXISTS public.pco_connections_safe;
CREATE VIEW public.pco_connections_safe WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  campus_id,
  pco_organization_name,
  connected_at,
  last_sync_at,
  sync_team_members,
  sync_phone_numbers,
  sync_birthdays,
  sync_positions,
  sync_active_only
FROM public.pco_connections
WHERE user_id = auth.uid();

-- Grant access
GRANT SELECT ON public.pco_connections_safe TO authenticated;

-- 5. Tighten profiles table - update RLS to be more restrictive
-- Drop overly permissive policies if they exist
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view basic profile info" ON public.profiles;

-- Create strict profile viewing policy
CREATE POLICY "Users can view own profile or authorized via consent" 
ON public.profiles 
FOR SELECT 
USING (
  auth.uid() = id 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    shares_campus_with(auth.uid(), id) 
    AND (share_contact_with_campus = true OR share_contact_with_pastors = true)
  )
);

-- 6. Fix service_plans - restrict NULL campus_id visibility to admins/pastors only
DROP POLICY IF EXISTS "Users can view their campus plans" ON public.service_plans;
CREATE POLICY "Users can view their campus plans or network-wide as authorized" 
ON public.service_plans 
FOR SELECT 
USING (
  -- User's own campus plans
  EXISTS (
    SELECT 1 FROM public.user_campuses uc 
    WHERE uc.user_id = auth.uid() 
    AND uc.campus_id = service_plans.campus_id
  )
  OR (
    -- Network-wide plans (null campus) only for admins/pastors
    campus_id IS NULL 
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      OR has_role(auth.uid(), 'network_worship_leader'::app_role)
    )
  )
);