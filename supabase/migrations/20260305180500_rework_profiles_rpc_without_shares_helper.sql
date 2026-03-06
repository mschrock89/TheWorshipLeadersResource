-- Rework get_profiles_for_campus to avoid shares_campus_with(...) runtime issues.
-- Uses direct campus overlap checks and null-safe auth handling.

DROP FUNCTION IF EXISTS public.get_profiles_for_campus();

CREATE FUNCTION public.get_profiles_for_campus()
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
  welcome_email_sent_at timestamp with time zone,
  gender text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH viewer AS (
    SELECT
      auth.uid() AS viewer_id,
      CASE WHEN auth.uid() IS NULL THEN false ELSE has_role(auth.uid(), 'admin'::app_role) END AS is_admin,
      CASE WHEN auth.uid() IS NULL THEN false ELSE has_role(auth.uid(), 'leader'::app_role) END AS is_leader,
      CASE
        WHEN auth.uid() IS NULL THEN false
        ELSE
          has_role(auth.uid(), 'campus_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
          OR has_role(auth.uid(), 'campus_pastor'::app_role)
          OR has_role(auth.uid(), 'network_worship_pastor'::app_role)
      END AS is_pastor
  ),
  profile_scope AS (
    SELECT
      p.*,
      EXISTS (
        SELECT 1
        FROM public.user_campuses viewer_uc
        JOIN public.user_campuses profile_uc
          ON profile_uc.campus_id = viewer_uc.campus_id
        JOIN viewer v ON true
        WHERE viewer_uc.user_id = v.viewer_id
          AND profile_uc.user_id = p.id
      ) AS shares_campus
    FROM public.profiles p
  )
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.positions,
    CASE
      WHEN p.id = v.viewer_id THEN p.email
      WHEN v.is_admin OR v.is_leader THEN p.email
      WHEN v.is_pastor AND p.share_contact_with_pastors THEN p.email
      WHEN p.shares_campus AND p.share_contact_with_campus THEN p.email
      ELSE NULL
    END AS email,
    CASE
      WHEN p.id = v.viewer_id THEN p.phone
      WHEN v.is_admin OR v.is_leader THEN p.phone
      WHEN v.is_pastor AND p.share_contact_with_pastors THEN p.phone
      WHEN p.shares_campus AND p.share_contact_with_campus THEN p.phone
      ELSE NULL
    END AS phone,
    CASE
      WHEN p.id = v.viewer_id THEN p.birthday
      WHEN v.is_admin OR v.is_leader THEN p.birthday
      WHEN v.is_pastor AND p.share_contact_with_pastors THEN p.birthday
      WHEN p.shares_campus AND p.share_contact_with_campus THEN p.birthday
      ELSE NULL
    END AS birthday,
    CASE
      WHEN p.id = v.viewer_id THEN p.anniversary
      WHEN v.is_admin OR v.is_leader THEN p.anniversary
      WHEN v.is_pastor AND p.share_contact_with_pastors THEN p.anniversary
      WHEN p.shares_campus AND p.share_contact_with_campus THEN p.anniversary
      ELSE NULL
    END AS anniversary,
    p.share_contact_with_campus,
    p.share_contact_with_pastors,
    p.ministry_types,
    p.welcome_email_sent_at,
    p.gender
  FROM profile_scope p
  CROSS JOIN viewer v
  WHERE
    v.viewer_id IS NOT NULL
    AND (
      p.id = v.viewer_id
      OR v.is_admin
      OR v.is_leader
      OR v.is_pastor
      OR p.shares_campus
    );
$$;

REVOKE ALL ON FUNCTION public.get_profiles_for_campus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_for_campus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profiles_for_campus() TO service_role;
