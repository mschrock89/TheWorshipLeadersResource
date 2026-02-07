
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Pastors and admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;

DROP POLICY IF EXISTS "Pastors and admins can insert campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Pastors and admins can update campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Pastors and admins can delete campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;

-- Recreate RLS policies on user_roles with campus_admin
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can update roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can delete roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- Recreate RLS policies on user_campuses with campus_admin
CREATE POLICY "Campus admins and above can insert campus assignments"
ON public.user_campuses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

CREATE POLICY "Campus admins and above can update campus assignments"
ON public.user_campuses
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

CREATE POLICY "Campus admins and above can delete campus assignments"
ON public.user_campuses
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_admin'::app_role) OR has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);
