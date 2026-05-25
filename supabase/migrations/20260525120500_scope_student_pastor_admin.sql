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
      )
  )
$$;

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
      AND has_role(_user_id, 'student_pastor'::app_role)
    )
$$;

DROP POLICY IF EXISTS "Admins can manage resource apps" ON public.resource_apps;
CREATE POLICY "Admins can manage resource apps"
  ON public.resource_apps
  FOR ALL
  USING (public.is_student_resource_app_admin(auth.uid(), key))
  WITH CHECK (public.is_student_resource_app_admin(auth.uid(), key));

DROP POLICY IF EXISTS "Users can view their app memberships" ON public.user_resource_app_memberships;
CREATE POLICY "Users can view their app memberships"
  ON public.user_resource_app_memberships
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_student_resource_app_admin(auth.uid(), app_key)
    OR (
      has_role(auth.uid(), 'campus_admin'::app_role)
      AND campus_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'campus_admin'::app_role
          AND ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  );

DROP POLICY IF EXISTS "Admins can manage app memberships" ON public.user_resource_app_memberships;
CREATE POLICY "Admins can manage app memberships"
  ON public.user_resource_app_memberships
  FOR ALL
  USING (
    public.is_student_resource_app_admin(auth.uid(), app_key)
    OR (
      has_role(auth.uid(), 'campus_admin'::app_role)
      AND campus_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'campus_admin'::app_role
          AND ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  )
  WITH CHECK (
    public.is_student_resource_app_admin(auth.uid(), app_key)
    OR (
      has_role(auth.uid(), 'campus_admin'::app_role)
      AND campus_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'campus_admin'::app_role
          AND ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  );

DROP POLICY IF EXISTS "Admins can insert feed posts" ON public.feed_posts;
CREATE POLICY "Admins can insert feed posts"
  ON public.feed_posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_student_resource_app_admin(auth.uid(), resource_app_key)
  );

DROP POLICY IF EXISTS "Admins can update feed posts" ON public.feed_posts;
CREATE POLICY "Admins can update feed posts"
  ON public.feed_posts
  FOR UPDATE
  USING (public.is_student_resource_app_admin(auth.uid(), resource_app_key))
  WITH CHECK (public.is_student_resource_app_admin(auth.uid(), resource_app_key));

DROP POLICY IF EXISTS "Admins can delete feed posts" ON public.feed_posts;
CREATE POLICY "Admins can delete feed posts"
  ON public.feed_posts
  FOR DELETE
  USING (public.is_student_resource_app_admin(auth.uid(), resource_app_key));

DROP POLICY IF EXISTS "Admin can insert albums" ON public.albums;
CREATE POLICY "Admin can insert albums" ON public.albums
  FOR INSERT
  WITH CHECK (public.is_student_resource_app_admin(auth.uid(), resource_app_key));

DROP POLICY IF EXISTS "Admin can update albums" ON public.albums;
CREATE POLICY "Admin can update albums" ON public.albums
  FOR UPDATE
  USING (public.is_student_resource_app_admin(auth.uid(), resource_app_key))
  WITH CHECK (public.is_student_resource_app_admin(auth.uid(), resource_app_key));

DROP POLICY IF EXISTS "Admin can delete albums" ON public.albums;
CREATE POLICY "Admin can delete albums" ON public.albums
  FOR DELETE
  USING (public.is_student_resource_app_admin(auth.uid(), resource_app_key));
