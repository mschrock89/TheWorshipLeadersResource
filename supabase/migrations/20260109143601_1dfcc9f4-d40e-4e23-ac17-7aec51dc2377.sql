-- Drop and recreate get_profiles_for_campus to include ministry_types
DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

CREATE FUNCTION public.get_profiles_for_campus()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  email text,
  phone text,
  birthday date,
  anniversary date,
  positions team_position[],
  ministry_types text[],
  welcome_email_sent_at timestamptz,
  share_contact_with_pastors boolean,
  share_contact_with_campus boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.full_name,
    p.avatar_url,
    CASE 
      WHEN p.id = auth.uid() THEN p.email
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.email
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.email
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END as email,
    CASE 
      WHEN p.id = auth.uid() THEN p.phone
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.phone
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.phone
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END as phone,
    CASE 
      WHEN p.id = auth.uid() THEN p.birthday
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.birthday
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.birthday
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END as birthday,
    CASE 
      WHEN p.id = auth.uid() THEN p.anniversary
      WHEN has_role(auth.uid(), 'admin'::app_role) THEN p.anniversary
      WHEN has_role(auth.uid(), 'campus_worship_pastor'::app_role) 
           AND shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_pastors THEN p.anniversary
      WHEN shares_campus_with(auth.uid(), p.id) 
           AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END as anniversary,
    p.positions,
    p.ministry_types,
    p.welcome_email_sent_at,
    p.share_contact_with_pastors,
    p.share_contact_with_campus
  FROM public.profiles p
  WHERE 
    p.id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_campus_with(auth.uid(), p.id)
$$;