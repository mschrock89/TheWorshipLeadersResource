-- Keep Team Directory edit permissions aligned across profile, campus,
-- ministry, role, serving requirement, and avatar updates.

CREATE OR REPLACE FUNCTION public.is_team_directory_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'admin'::app_role)
    OR has_role(_user_id, 'campus_admin'::app_role)
    OR has_role(_user_id, 'network_worship_leader'::app_role)
    OR has_role(_user_id, 'network_worship_pastor'::app_role)
    OR has_role(_user_id, 'campus_worship_pastor'::app_role)
    OR has_role(_user_id, 'student_pastor'::app_role)
    OR has_role(_user_id, 'student_worship_pastor'::app_role)
    OR has_role(_user_id, 'childrens_pastor'::app_role)
    OR has_role(_user_id, 'video_director'::app_role)
    OR has_role(_user_id, 'production_manager'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_directory_campus(
  _manager_id uuid,
  _campus_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _manager_id IS NOT NULL
    AND _campus_id IS NOT NULL
    AND (
      has_role(_manager_id, 'admin'::app_role)
      OR has_role(_manager_id, 'student_pastor'::app_role)
      OR has_role(_manager_id, 'network_worship_leader'::app_role)
      OR has_role(_manager_id, 'network_worship_pastor'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _manager_id
          AND ur.role = 'campus_admin'::app_role
          AND (
            ur.admin_campus_id IS NULL
            OR ur.admin_campus_id = _campus_id
          )
      )
      OR (
        (
          has_role(_manager_id, 'campus_worship_pastor'::app_role)
          OR has_role(_manager_id, 'student_worship_pastor'::app_role)
          OR has_role(_manager_id, 'childrens_pastor'::app_role)
          OR has_role(_manager_id, 'video_director'::app_role)
          OR has_role(_manager_id, 'production_manager'::app_role)
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_campuses uc
          WHERE uc.user_id = _manager_id
            AND uc.campus_id = _campus_id
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_directory_profile(
  _manager_id uuid,
  _profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _manager_id IS NOT NULL
    AND _profile_id IS NOT NULL
    AND (
      has_role(_manager_id, 'admin'::app_role)
      OR has_role(_manager_id, 'student_pastor'::app_role)
      OR has_role(_manager_id, 'network_worship_leader'::app_role)
      OR has_role(_manager_id, 'network_worship_pastor'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _manager_id
          AND ur.role = 'campus_admin'::app_role
          AND ur.admin_campus_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_campuses profile_uc
        WHERE profile_uc.user_id = _profile_id
          AND public.can_manage_team_directory_campus(_manager_id, profile_uc.campus_id)
      )
    )
$$;

REVOKE ALL ON FUNCTION public.is_team_directory_manager(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_team_directory_campus(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_team_directory_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_directory_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_team_directory_campus(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_team_directory_profile(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Team managers can update any profile" ON public.profiles;
CREATE POLICY "Team managers can update any profile" ON public.profiles
FOR UPDATE
USING (public.can_manage_team_directory_profile(auth.uid(), id))
WITH CHECK (public.can_manage_team_directory_profile(auth.uid(), id));

DROP POLICY IF EXISTS "Campus admins and above can delete campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can delete campus assignments" ON public.user_campuses
FOR DELETE
USING (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Campus admins and above can insert campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can insert campus assignments" ON public.user_campuses
FOR INSERT
WITH CHECK (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Campus admins and above can update campus assignments" ON public.user_campuses;
CREATE POLICY "Campus admins and above can update campus assignments" ON public.user_campuses
FOR UPDATE
USING (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
)
WITH CHECK (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Team managers can view all ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can view all ministry assignments" ON public.user_ministry_campuses
FOR SELECT
USING (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Team managers can insert ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can insert ministry assignments" ON public.user_ministry_campuses
FOR INSERT
WITH CHECK (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Team managers can delete ministry assignments" ON public.user_ministry_campuses;
CREATE POLICY "Team managers can delete ministry assignments" ON public.user_ministry_campuses
FOR DELETE
USING (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Team managers can manage campus ministry positions" ON public.user_campus_ministry_positions;
CREATE POLICY "Team managers can manage campus ministry positions" ON public.user_campus_ministry_positions
FOR ALL
USING (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
)
WITH CHECK (
  public.can_manage_team_directory_profile(auth.uid(), user_id)
  OR public.can_manage_team_directory_campus(auth.uid(), campus_id)
);

DROP POLICY IF EXISTS "Leaders can upsert serving requirements" ON public.user_serving_requirements;
CREATE POLICY "Leaders can upsert serving requirements"
ON public.user_serving_requirements
FOR ALL
USING (
  auth.uid() = user_id
  OR public.can_manage_team_directory_profile(auth.uid(), user_id)
)
WITH CHECK (
  auth.uid() = user_id
  OR public.can_manage_team_directory_profile(auth.uid(), user_id)
);

DROP POLICY IF EXISTS "Campus admins and above can delete roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can delete roles" ON public.user_roles
FOR DELETE
USING (public.can_manage_team_directory_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Campus admins and above can insert roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can insert roles" ON public.user_roles
FOR INSERT
WITH CHECK (public.can_manage_team_directory_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Campus admins and above can update roles" ON public.user_roles;
CREATE POLICY "Campus admins and above can update roles" ON public.user_roles
FOR UPDATE
USING (public.can_manage_team_directory_profile(auth.uid(), user_id))
WITH CHECK (public.can_manage_team_directory_profile(auth.uid(), user_id));

DROP POLICY IF EXISTS "Users can view roles" ON public.user_roles;
CREATE POLICY "Users can view roles" ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.can_manage_team_directory_profile(auth.uid(), user_id)
);

DROP POLICY IF EXISTS "Team managers can upload managed avatars" ON storage.objects;
CREATE POLICY "Team managers can upload managed avatars"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_manage_team_directory_profile(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "Team managers can update managed avatars" ON storage.objects;
CREATE POLICY "Team managers can update managed avatars"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_manage_team_directory_profile(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'avatars'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_manage_team_directory_profile(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS "Team managers can delete managed avatars" ON storage.objects;
CREATE POLICY "Team managers can delete managed avatars"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'avatars'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_manage_team_directory_profile(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);
