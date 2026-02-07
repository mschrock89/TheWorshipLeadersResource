-- Drop existing SELECT policies on profiles
DROP POLICY IF EXISTS "Users can view profiles with consent" ON public.profiles;
DROP POLICY IF EXISTS "Campus pastors can view consented campus profiles" ON public.profiles;

-- Create a function to get profiles with sensitive data masked unless consent given
CREATE OR REPLACE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions public.team_position[],
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz
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
    -- Mask phone unless allowed
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
    -- Mask birthday unless allowed
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
    -- Mask anniversary unless allowed
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
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = profile_id
    AND (
      p.id = auth.uid()
      OR has_role(auth.uid(), 'leader'::app_role)
      OR shares_campus_with(auth.uid(), p.id)
    )
$$;

-- New SELECT policy: allow access to basic info for campus members, full access for own/leaders
-- Sensitive columns will be masked via the function or handled in app code
CREATE POLICY "Users can view basic profile info"
ON public.profiles
FOR SELECT
USING (
  -- Own profile
  auth.uid() = id
  -- Leaders see all
  OR has_role(auth.uid(), 'leader'::app_role)
  -- Campus pastors see profiles with consent
  OR (has_role(auth.uid(), 'campus_pastor'::app_role) 
      AND shares_campus_with(auth.uid(), id) 
      AND share_contact_with_pastors = true)
  -- Campus members see profiles with consent
  OR (shares_campus_with(auth.uid(), id) 
      AND share_contact_with_campus = true)
);