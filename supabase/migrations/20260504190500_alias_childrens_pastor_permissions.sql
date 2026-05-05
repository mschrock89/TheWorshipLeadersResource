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
      )
  )
$$;
