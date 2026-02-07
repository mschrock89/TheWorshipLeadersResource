-- Drop and recreate get_profile_safe function to include gender field
DROP FUNCTION IF EXISTS public.get_profile_safe(uuid);

CREATE FUNCTION public.get_profile_safe(profile_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  positions public.team_position[],
  email text,
  phone text,
  birthday text,
  anniversary text,
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  created_at timestamptz,
  updated_at timestamptz,
  gender text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer_id uuid := auth.uid();
  is_admin boolean;
  is_pastor boolean;
BEGIN
  -- Check viewer's roles
  is_admin := has_role(viewer_id, 'admin'::app_role);
  is_pastor := has_role(viewer_id, 'campus_worship_pastor'::app_role) 
            OR has_role(viewer_id, 'student_worship_pastor'::app_role)
            OR has_role(viewer_id, 'campus_pastor'::app_role);

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    -- Email: filtered based on permissions
    CASE 
      WHEN p.id = viewer_id THEN p.email
      WHEN is_admin THEN p.email
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END,
    -- Phone: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.phone
      WHEN is_admin THEN p.phone
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END,
    -- Birthday: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.birthday
      WHEN is_admin THEN p.birthday
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END,
    -- Anniversary: filtered
    CASE 
      WHEN p.id = viewer_id THEN p.anniversary
      WHEN is_admin THEN p.anniversary
      WHEN is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(viewer_id, p.id) AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.created_at,
    p.updated_at,
    -- Gender: always visible (needed for swap matching)
    p.gender
  FROM profiles p
  WHERE p.id = profile_id
    AND (
      p.id = viewer_id
      OR is_admin
      OR shares_campus_with(viewer_id, p.id)
    );
END;
$$;