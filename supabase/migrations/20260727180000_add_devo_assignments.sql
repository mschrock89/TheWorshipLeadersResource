-- Devotional (DEVO) writing assignments: chapter assignment, guide upload,
-- and temporary post_feed capability via user_capability_overrides.

CREATE TABLE IF NOT EXISTS public.devo_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  chapter_reference text NOT NULL,
  series_title text,
  due_date date,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'guide_uploaded', 'posted', 'cancelled')),
  guide_storage_path text,
  guide_file_name text,
  guide_uploaded_at timestamptz,
  feed_post_id uuid REFERENCES public.feed_posts(id) ON DELETE SET NULL,
  resource_app_key text NOT NULL DEFAULT 'worship',
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  ministry_type text,
  post_feed_expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(chapter_reference) <> '')
);

CREATE INDEX IF NOT EXISTS devo_assignments_assignee_status_idx
  ON public.devo_assignments(assignee_id, status, due_date);

CREATE INDEX IF NOT EXISTS devo_assignments_app_status_idx
  ON public.devo_assignments(resource_app_key, status, created_at DESC);

CREATE OR REPLACE TRIGGER update_devo_assignments_updated_at
BEFORE UPDATE ON public.devo_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.devo_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assignees can view own devo assignments" ON public.devo_assignments;
CREATE POLICY "Assignees can view own devo assignments"
  ON public.devo_assignments
  FOR SELECT
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
  );

DROP POLICY IF EXISTS "Admins can insert devo assignments" ON public.devo_assignments;
CREATE POLICY "Admins can insert devo assignments"
  ON public.devo_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
    AND assigned_by = auth.uid()
  );

DROP POLICY IF EXISTS "Assignees and admins can update devo assignments" ON public.devo_assignments;
CREATE POLICY "Assignees and admins can update devo assignments"
  ON public.devo_assignments
  FOR UPDATE
  TO authenticated
  USING (
    assignee_id = auth.uid()
    OR public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
  );

DROP POLICY IF EXISTS "Admins can delete devo assignments" ON public.devo_assignments;
CREATE POLICY "Admins can delete devo assignments"
  ON public.devo_assignments
  FOR DELETE
  TO authenticated
  USING (public.has_capability(auth.uid(), 'admin_tools', resource_app_key));

-- ---------------------------------------------------------------------------
-- Private storage bucket for assignee-uploaded guides
-- Path: {assignment_id}/{timestamp}-{safeName}
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('devo_guides', 'devo_guides', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Devo assignees and admins can read guides" ON storage.objects;
CREATE POLICY "Devo assignees and admins can read guides"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND EXISTS (
    SELECT 1
    FROM public.devo_assignments a
    WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
      AND (
        a.assignee_id = auth.uid()
        OR public.has_capability(auth.uid(), 'admin_tools', a.resource_app_key)
      )
  )
);

DROP POLICY IF EXISTS "Devo assignees can upload guides" ON storage.objects;
CREATE POLICY "Devo assignees can upload guides"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'devo_guides'
  AND EXISTS (
    SELECT 1
    FROM public.devo_assignments a
    WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
      AND a.assignee_id = auth.uid()
      AND a.status IN ('assigned', 'guide_uploaded')
  )
);

DROP POLICY IF EXISTS "Devo assignees and admins can update guides" ON storage.objects;
CREATE POLICY "Devo assignees and admins can update guides"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND EXISTS (
    SELECT 1
    FROM public.devo_assignments a
    WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
      AND (
        a.assignee_id = auth.uid()
        OR public.has_capability(auth.uid(), 'admin_tools', a.resource_app_key)
      )
  )
)
WITH CHECK (
  bucket_id = 'devo_guides'
  AND EXISTS (
    SELECT 1
    FROM public.devo_assignments a
    WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
      AND (
        a.assignee_id = auth.uid()
        OR public.has_capability(auth.uid(), 'admin_tools', a.resource_app_key)
      )
  )
);

DROP POLICY IF EXISTS "Devo assignees and admins can delete guides" ON storage.objects;
CREATE POLICY "Devo assignees and admins can delete guides"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'devo_guides'
  AND EXISTS (
    SELECT 1
    FROM public.devo_assignments a
    WHERE a.id = nullif((storage.foldername(name))[1], '')::uuid
      AND (
        a.assignee_id = auth.uid()
        OR public.has_capability(auth.uid(), 'admin_tools', a.resource_app_key)
      )
  )
);

-- ---------------------------------------------------------------------------
-- Temporary post_feed grants for DEVO assignees.
-- Overrides table writes are admin-role-only; these helpers let admin_tools
-- users grant/revoke Devo-owned temporary access without widening that RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_devo_post_feed(
  _user_id uuid,
  _resource_app text,
  _expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_granted boolean;
  existing_expires timestamptz;
  existing_note text;
  next_expires timestamptz := _expires_at;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_capability(auth.uid(), 'admin_tools', _resource_app) THEN
    RAISE EXCEPTION 'Not authorized to grant Devo Feed access';
  END IF;

  SELECT o.granted, o.expires_at, o.note
    INTO existing_granted, existing_expires, existing_note
  FROM public.user_capability_overrides o
  WHERE o.user_id = _user_id
    AND o.capability_key = 'post_feed'
    AND o.resource_app = _resource_app;

  -- Permanent override — leave alone.
  IF existing_granted = true AND existing_expires IS NULL THEN
    RETURN false;
  END IF;

  -- Role-based access with no Devo-owned override — leave alone.
  IF public.has_capability(_user_id, 'post_feed', _resource_app)
     AND (existing_note IS DISTINCT FROM 'Devo assignment') THEN
    RETURN false;
  END IF;

  -- Non-Devo temporary override — leave alone.
  IF existing_granted = true
     AND existing_expires IS NOT NULL
     AND existing_note IS DISTINCT FROM 'Devo assignment' THEN
    RETURN false;
  END IF;

  IF existing_granted = true
     AND existing_note = 'Devo assignment'
     AND existing_expires IS NOT NULL
     AND existing_expires > next_expires THEN
    next_expires := existing_expires;
  END IF;

  INSERT INTO public.user_capability_overrides (
    user_id, capability_key, resource_app, granted, expires_at, note
  ) VALUES (
    _user_id, 'post_feed', _resource_app, true, next_expires, 'Devo assignment'
  )
  ON CONFLICT (user_id, capability_key, resource_app) DO UPDATE
  SET granted = true,
      expires_at = EXCLUDED.expires_at,
      note = 'Devo assignment';

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_devo_post_feed_if_idle(
  _user_id uuid,
  _resource_app text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
  override_note text;
  override_expires timestamptz;
  override_granted boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_capability(auth.uid(), 'admin_tools', _resource_app)
    OR auth.uid() = _user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to revoke Devo Feed access';
  END IF;

  SELECT count(*)::integer INTO active_count
  FROM public.devo_assignments a
  WHERE a.assignee_id = _user_id
    AND a.resource_app_key = _resource_app
    AND a.status IN ('assigned', 'guide_uploaded');

  IF active_count > 0 THEN
    RETURN false;
  END IF;

  SELECT o.note, o.expires_at, o.granted
    INTO override_note, override_expires, override_granted
  FROM public.user_capability_overrides o
  WHERE o.user_id = _user_id
    AND o.capability_key = 'post_feed'
    AND o.resource_app = _resource_app;

  IF override_granted IS DISTINCT FROM true THEN
    RETURN false;
  END IF;
  IF override_note IS DISTINCT FROM 'Devo assignment' THEN
    RETURN false;
  END IF;
  IF override_expires IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_capability_overrides
  WHERE user_id = _user_id
    AND capability_key = 'post_feed'
    AND resource_app = _resource_app;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_devo_post_feed(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_devo_post_feed_if_idle(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
