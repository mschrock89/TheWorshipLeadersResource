-- First drop the existing function that has a different return type
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

-- Create the new function with filtered sensitive data
CREATE OR REPLACE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE(
  id uuid,
  full_name text,
  avatar_url text,
  positions team_position[],
  email text,
  phone text,
  birthday date,
  anniversary date,
  share_contact_with_campus boolean,
  share_contact_with_pastors boolean,
  ministry_types text[],
  welcome_email_sent_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
            OR has_role(viewer_id, 'campus_pastor'::app_role)
            OR has_role(viewer_id, 'network_worship_pastor'::app_role);

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
    p.ministry_types,
    p.welcome_email_sent_at
  FROM profiles p
  WHERE 
    p.id = viewer_id
    OR is_admin
    OR shares_campus_with(viewer_id, p.id);
END;
$$;