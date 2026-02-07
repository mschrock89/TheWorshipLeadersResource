-- Drop existing policies on user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Drop existing policies on user_campuses
DROP POLICY IF EXISTS "Admins can manage campus assignments" ON public.user_campuses;
DROP POLICY IF EXISTS "Users can view campus assignments" ON public.user_campuses;

-- Create new policies for user_roles

-- SELECT: Users can view their own role, pastors can view roles in their campus, admins can view all
CREATE POLICY "Users can view roles"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- INSERT: Only admins and pastors can assign roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- UPDATE: Only admins and pastors can update roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can update roles"
ON public.user_roles
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- DELETE: Only admins and pastors can delete roles (pastors only for users in their campus)
CREATE POLICY "Pastors and admins can delete roles"
ON public.user_roles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- Create new policies for user_campuses

-- SELECT: Anyone authenticated can view campus assignments (needed for shares_campus_with function)
CREATE POLICY "Authenticated users can view campus assignments"
ON public.user_campuses
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- INSERT: Only admins and pastors can assign campuses
CREATE POLICY "Pastors and admins can insert campus assignments"
ON public.user_campuses
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  OR has_role(auth.uid(), 'student_worship_pastor'::app_role)
);

-- UPDATE: Only admins and pastors can update campus assignments
CREATE POLICY "Pastors and admins can update campus assignments"
ON public.user_campuses
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);

-- DELETE: Only admins and pastors can delete campus assignments
CREATE POLICY "Pastors and admins can delete campus assignments"
ON public.user_campuses
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    (has_role(auth.uid(), 'campus_worship_pastor'::app_role) OR has_role(auth.uid(), 'student_worship_pastor'::app_role))
    AND shares_campus_with(auth.uid(), user_id)
  )
);