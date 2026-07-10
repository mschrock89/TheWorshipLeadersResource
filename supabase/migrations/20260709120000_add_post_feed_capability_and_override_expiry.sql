-- Feed posting becomes a capability, and per-user overrides gain an expiry so
-- access can be granted temporarily (e.g. "let this leader post to the Feed for
-- this weekend"). Mirrors is_student_resource_app_admin exactly, so nothing
-- changes for existing admins — it just becomes grantable via overrides.

-- ---------------------------------------------------------------------------
-- 1. Temporary-access support: an optional expiry on overrides. NULL = permanent.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_capability_overrides
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. has_capability now ignores expired override rows (both grants and revokes).
-- ---------------------------------------------------------------------------
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
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_capabilities rc ON rc.role = ur.role
        WHERE ur.user_id = _user_id
          AND rc.capability_key = 'admin_full'
          AND rc.resource_app IN (_app, 'all')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. The post_feed capability, seeded to match is_student_resource_app_admin:
--    admin everywhere; student + network student pastors in the student apps.
-- ---------------------------------------------------------------------------
INSERT INTO public.capabilities (key, label, category, description) VALUES
  ('post_feed', 'Post to the Feed', 'Content', 'Create, edit, and delete Feed posts for the app.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_capabilities (role, capability_key, resource_app) VALUES
  ('admin',                 'post_feed', 'all'),
  ('student_pastor',        'post_feed', 'students_hs'),
  ('student_pastor',        'post_feed', 'students_ms'),
  ('network_student_pastor','post_feed', 'students_hs'),
  ('network_student_pastor','post_feed', 'students_ms')
ON CONFLICT (role, capability_key, resource_app) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Route feed_posts writes through has_capability('post_feed', <app>).
--    Preserves the author check on INSERT. Behavior-preserving because the seed
--    reproduces is_student_resource_app_admin, plus anyone granted post_feed via
--    an override now qualifies (the whole point).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can insert feed posts" ON public.feed_posts;
CREATE POLICY "Admins can insert feed posts"
  ON public.feed_posts
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.has_capability(auth.uid(), 'post_feed', resource_app_key)
  );

DROP POLICY IF EXISTS "Admins can update feed posts" ON public.feed_posts;
CREATE POLICY "Admins can update feed posts"
  ON public.feed_posts
  FOR UPDATE
  USING (public.has_capability(auth.uid(), 'post_feed', resource_app_key))
  WITH CHECK (public.has_capability(auth.uid(), 'post_feed', resource_app_key));

DROP POLICY IF EXISTS "Admins can delete feed posts" ON public.feed_posts;
CREATE POLICY "Admins can delete feed posts"
  ON public.feed_posts
  FOR DELETE
  USING (public.has_capability(auth.uid(), 'post_feed', resource_app_key));

NOTIFY pgrst, 'reload schema';
