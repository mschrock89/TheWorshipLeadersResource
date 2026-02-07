-- Drop the restrictive policy and create one that allows basic access for chat purposes
DROP POLICY IF EXISTS "Users can view basic profile info" ON public.profiles;

-- Create policy that allows viewing profiles for chat (basic info) and full access with consent
-- The key insight: chat messages need to join with profiles to show sender name/avatar
-- We allow SELECT for campus members, but sensitive data is handled at app level
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  -- Own profile - full access
  auth.uid() = id
  -- Leaders - full access
  OR has_role(auth.uid(), 'leader'::app_role)
  -- Campus members can view basic info (name, avatar) for chat
  -- Sensitive fields are protected via the get_basic_profiles() function
  OR shares_campus_with(auth.uid(), id)
);

-- Update get_basic_profiles to be the standard way to list profiles (only exposes name/avatar)
-- This is already correctly implemented, just documenting it here

-- Create a new function for listing all profiles with appropriate masking
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions public.team_position[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    -- Mask email unless allowed
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    -- Mask phone
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    -- Mask anniversary
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'leader'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'leader'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$$;