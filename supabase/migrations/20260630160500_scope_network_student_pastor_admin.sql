-- Wire the new network_student_pastor role into the role-resolution helpers so it
-- inherits Student Pastor's permissions network-wide.
--
-- has_role(): network_student_pastor satisfies student_pastor and
-- student_worship_pastor checks, so every RLS policy that already trusts a Student
-- Pastor also trusts a Network Student Pastor.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        OR (
          role = 'childrens_pastor'::app_role
          AND _role IN ('campus_worship_pastor'::app_role, 'student_worship_pastor'::app_role)
        )
        OR (
          role = 'student_pastor'::app_role
          AND _role = 'student_worship_pastor'::app_role
        )
        OR (
          role = 'network_student_pastor'::app_role
          AND _role IN ('student_pastor'::app_role, 'student_worship_pastor'::app_role)
        )
      )
  )
$$;

-- is_student_resource_app_admin(): grant Network Student Pastors admin over the
-- HS and MS student resource apps, just like Student Pastors.
CREATE OR REPLACE FUNCTION public.is_student_resource_app_admin(_user_id UUID, _resource_app_key text)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'admin'::app_role)
    OR (
      _resource_app_key IN ('students_hs', 'students_ms')
      AND (
        has_role(_user_id, 'student_pastor'::app_role)
        OR has_role(_user_id, 'network_student_pastor'::app_role)
      )
    )
$$;
