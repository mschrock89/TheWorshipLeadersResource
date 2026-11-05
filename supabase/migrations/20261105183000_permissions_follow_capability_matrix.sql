-- The permissions screen is the source of truth.
-- Each capability checkbox grants only that capability. Full admin access no
-- longer implies every other capability, and checks that hardcoded the admin
-- role now follow those checkboxes.

UPDATE public.capabilities
SET description = 'Unrestricted org-wide access. Does not grant the other capabilities; each of those is its own checkbox.'
WHERE key = 'admin_full';

CREATE OR REPLACE FUNCTION public.has_capability(_user_id UUID, _cap TEXT, _app TEXT DEFAULT 'all')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.user_capability_overrides o
      WHERE o.user_id = _user_id
        AND o.capability_key = _cap
        AND o.resource_app IN (_app, 'all')
        AND o.granted = false
        AND (o.expires_at IS NULL OR o.expires_at > now())
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.user_capability_overrides o
        WHERE o.user_id = _user_id
          AND o.capability_key = _cap
          AND o.resource_app IN (_app, 'all')
          AND o.granted = true
          AND (o.expires_at IS NULL OR o.expires_at > now())
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_capabilities rc ON rc.role = ur.role
        WHERE ur.user_id = _user_id
          AND rc.capability_key = _cap
          AND rc.resource_app IN (_app, 'all')
      )
    );
$$;

-- Swap a hardcoded admin-role predicate for the two admin checkboxes.
CREATE OR REPLACE FUNCTION public.permission_expr_follow_capabilities(_expr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    regexp_replace(
      regexp_replace(
        _expr,
        '(?:public\.)?has_role\(\s*((?:[^,()]|\([^)]*\))+)\s*,\s*''admin''::(?:public\.)?app_role\s*\)',
        '(public.has_capability(\1, ''admin_full'') OR public.has_capability(\1, ''admin_tools''))',
        'g'
      ),
      '([A-Za-z_][A-Za-z0-9_]*)\.role\s*=\s*''admin''::(?:public\.)?app_role',
      '(public.has_capability(\1.user_id, ''admin_full'') OR public.has_capability(\1.user_id, ''admin_tools''))',
      'g'
    );
$$;

CREATE TEMP TABLE permission_policy_rewrite ON COMMIT DROP AS
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS old_qual,
  with_check AS old_check,
  CASE WHEN qual IS NULL THEN NULL ELSE public.permission_expr_follow_capabilities(qual) END AS new_qual,
  CASE WHEN with_check IS NULL THEN NULL ELSE public.permission_expr_follow_capabilities(with_check) END AS new_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    coalesce(qual, '') ~ 'has_role\(|role = ''admin'''
    OR coalesce(with_check, '') ~ 'has_role\(|role = ''admin'''
  );

DO $$
DECLARE
  rec record;
  role_list text;
  using_sql text;
  check_sql text;
BEGIN
  FOR rec IN
    SELECT * FROM permission_policy_rewrite
    WHERE new_qual IS DISTINCT FROM old_qual
       OR new_check IS DISTINCT FROM old_check
  LOOP
    SELECT string_agg(quote_ident(role_name), ', ')
      INTO role_list
    FROM unnest(rec.roles) AS role_name;

    using_sql := CASE WHEN rec.new_qual IS NULL THEN '' ELSE format(' USING (%s)', rec.new_qual) END;
    check_sql := CASE WHEN rec.new_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', rec.new_check) END;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', rec.policyname, rec.schemaname, rec.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      rec.policyname,
      rec.schemaname,
      rec.tablename,
      rec.permissive,
      rec.cmd,
      coalesce(role_list, 'public'),
      using_sql,
      check_sql
    );
  END LOOP;
END $$;

-- Functions that still name the admin role. Skip the two helpers above.
DO $$
DECLARE
  rec record;
  def text;
  newdef text;
BEGIN
  FOR rec IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname NOT IN ('has_role', 'has_capability', 'permission_expr_follow_capabilities')
  LOOP
    def := pg_get_functiondef(rec.oid);
    newdef := public.permission_expr_follow_capabilities(def);
    IF newdef IS DISTINCT FROM def THEN
      EXECUTE newdef;
    END IF;
  END LOOP;
END $$;

-- Feature gates follow their own checkbox, including when the admin role is
-- still assigned but that checkbox is off.

CREATE OR REPLACE FUNCTION public.is_student_resource_app_admin(_user_id uuid, _resource_app_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_capability(_user_id, 'admin_full', coalesce(_resource_app_key, 'all'));
$$;

CREATE OR REPLACE FUNCTION public.is_team_directory_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_capability(_user_id, 'manage_team');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_team_directory_campus(_manager_id uuid, _campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _manager_id IS NOT NULL
    AND _campus_id IS NOT NULL
    AND public.has_capability(_manager_id, 'manage_team')
    AND (
      public.has_capability(_manager_id, 'admin_full')
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _manager_id
          AND ur.role = 'campus_admin'::app_role
          AND (ur.admin_campus_id IS NULL OR ur.admin_campus_id = _campus_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_campuses uc
        WHERE uc.user_id = _manager_id
          AND uc.campus_id = _campus_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_review_break_request(_request_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_capability(auth.uid(), 'admin_full')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR (
      public.has_capability(auth.uid(), 'manage_team')
      AND public.shares_campus_with(auth.uid(), _request_user_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.user_campuses uc ON uc.user_id = _request_user_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'campus_admin'::app_role
        AND ur.admin_campus_id = uc.campus_id
    );
$$;

CREATE OR REPLACE FUNCTION public.viewer_can_manage_swap_ministry(_viewer_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_capability(_viewer_id, 'manage_team')
    OR (
      coalesce(_ministry_type, '') = 'video'
      AND public.has_capability(_viewer_id, 'video_director_tools')
    )
    OR (
      coalesce(_ministry_type, '') IN ('production', 'ms_hs_production', 'hs_production')
      AND public.has_capability(_viewer_id, 'production_manager_tools')
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_chat(_user_id uuid, _campus_id uuid, _ministry_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_capability(_user_id, 'switch_campus_chat')
    OR EXISTS (
      SELECT 1
      FROM public.user_ministry_campuses umc
      WHERE umc.user_id = _user_id
        AND umc.campus_id = _campus_id
        AND public.normalize_chat_ministry_type(umc.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
        AND EXISTS (
          SELECT 1
          FROM public.user_campus_ministry_positions ucmp
          WHERE ucmp.user_id = umc.user_id
            AND ucmp.campus_id = umc.campus_id
            AND public.normalize_chat_ministry_type(ucmp.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
            AND ucmp.position <> 'drum_tech'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_production_live(_user_id uuid, _campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_capability(_user_id, 'production_manager_tools')
    OR EXISTS (
      SELECT 1
      FROM public.user_ministry_campuses umc
      WHERE umc.user_id = _user_id
        AND umc.campus_id = _campus_id
        AND umc.ministry_type IN ('production', 'ms_hs_production', 'hs_production')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_campus_ministry_positions ucmp
      WHERE ucmp.user_id = _user_id
        AND ucmp.campus_id = _campus_id
        AND (
          ucmp.ministry_type IN ('production', 'ms_hs_production', 'hs_production')
          OR ucmp.position IN (
            'sound_tech', 'mon', 'producer', 'lighting', 'media', 'broadcast', 'audio_shadow'
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_video_live(_user_id uuid, _campus_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_capability(_user_id, 'video_director_tools')
    OR EXISTS (
      SELECT 1
      FROM public.user_ministry_campuses umc
      WHERE umc.user_id = _user_id
        AND umc.campus_id = _campus_id
        AND umc.ministry_type = 'video'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_campus_ministry_positions ucmp
      WHERE ucmp.user_id = _user_id
        AND ucmp.campus_id = _campus_id
        AND (
          ucmp.ministry_type = 'video'
          OR ucmp.position IN (
            'tri_pod_camera', 'tri_pod_camera_1', 'tri_pod_camera_2', 'tri_pod_camera_3', 'tri_pod_camera_4',
            'hand_held_camera', 'hand_held_camera_1', 'hand_held_camera_2', 'hand_held_camera_3', 'hand_held_camera_4',
            'director', 'director_2', 'director_3', 'director_4',
            'graphics', 'graphics_2', 'graphics_3', 'graphics_4',
            'switcher', 'switcher_2', 'switcher_3', 'switcher_4'
          )
        )
    );
$$;

-- Editing the matrix itself follows Manage permissions, plus either admin checkbox.
DROP POLICY IF EXISTS "role_capabilities admin write" ON public.role_capabilities;
CREATE POLICY "role_capabilities admin write" ON public.role_capabilities
  FOR ALL
  USING (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  )
  WITH CHECK (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  );

DROP POLICY IF EXISTS "overrides admin write" ON public.user_capability_overrides;
CREATE POLICY "overrides admin write" ON public.user_capability_overrides
  FOR ALL
  USING (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  )
  WITH CHECK (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  );

DROP POLICY IF EXISTS "approval rules admin write" ON public.setlist_approval_rules;
CREATE POLICY "approval rules admin write" ON public.setlist_approval_rules
  FOR ALL
  USING (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  )
  WITH CHECK (
    public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  );

DROP POLICY IF EXISTS "overrides readable by owner or admin" ON public.user_capability_overrides;
CREATE POLICY "overrides readable by owner or admin" ON public.user_capability_overrides
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_capability(auth.uid(), 'manage_permissions')
    OR public.has_capability(auth.uid(), 'admin_tools')
    OR public.has_capability(auth.uid(), 'admin_full')
  );

DROP FUNCTION public.permission_expr_follow_capabilities(text);
