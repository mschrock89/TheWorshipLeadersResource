-- Add campus-scoped profiles RPC for Team Builder / break viewer
-- This avoids relying on the viewer having user_campuses rows (campus_admins often don't)

CREATE OR REPLACE FUNCTION public.get_profiles_for_campus_id(_campus_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  positions public.team_position[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: org admins can view any campus; campus_admin can view their admin campus
  IF has_role(auth.uid(), 'admin'::public.app_role)
     OR EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role = 'campus_admin'::public.app_role
         AND ur.admin_campus_id = _campus_id
     )
     OR has_role(auth.uid(), 'campus_worship_pastor'::public.app_role)
     OR has_role(auth.uid(), 'student_worship_pastor'::public.app_role)
  THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, COALESCE(p.positions, '{}'::public.team_position[])
    FROM public.profiles p
    WHERE p.id IN (
      SELECT uc.user_id
      FROM public.user_campuses uc
      WHERE uc.campus_id = _campus_id
    )
    ORDER BY p.full_name;
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_profiles_for_campus_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profiles_for_campus_id(uuid) TO authenticated;