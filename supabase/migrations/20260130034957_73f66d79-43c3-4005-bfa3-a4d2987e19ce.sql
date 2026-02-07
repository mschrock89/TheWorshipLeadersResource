-- Drop and recreate get_profile_safe function to include default_campus_id
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

CREATE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  birthday text,
  anniversary text,
  gender text,
  positions public.team_position[],
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz,
  default_campus_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_own_profile boolean;
  is_admin boolean;
  is_pastor boolean;
  shares_campus boolean;
BEGIN
  -- Check if viewing own profile
  is_own_profile := (profile_id = viewer_id);
  
  -- Check if viewer is admin or network worship pastor/leader
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('admin', 'network_worship_pastor', 'network_worship_leader')
  ) INTO is_admin;
  
  -- Check if viewer is any type of pastor
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = viewer_id 
    AND ur.role IN ('campus_pastor', 'campus_worship_pastor', 'student_worship_pastor', 'network_worship_pastor')
  ) INTO is_pastor;
  
  -- Check if they share a campus
  SELECT EXISTS (
    SELECT 1 FROM public.user_campuses uc1
    JOIN public.user_campuses uc2 ON uc1.campus_id = uc2.campus_id
    WHERE uc1.user_id = viewer_id AND uc2.user_id = profile_id
  ) INTO shares_campus;
  
  -- Return profile data with appropriate masking
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    -- Mask phone based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    -- Mask birthday based on consent  
    CASE 
      WHEN is_own_profile OR is_admin THEN p.birthday::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.birthday::text
      ELSE NULL
    END as birthday,
    -- Mask anniversary based on consent
    CASE 
      WHEN is_own_profile OR is_admin THEN p.anniversary::text
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary::text
      WHEN shares_campus AND p.share_contact_with_campus THEN p.anniversary::text
      ELSE NULL
    END as anniversary,
    p.gender,
    p.positions,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at,
    -- Only return default_campus_id for own profile or admin
    CASE 
      WHEN is_own_profile OR is_admin THEN p.default_campus_id
      ELSE NULL
    END as default_campus_id
  FROM public.profiles p
  WHERE p.id = profile_id;
END;
$$;