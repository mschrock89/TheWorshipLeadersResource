-- Posting permission opens N days before go-live (not from assignment forever).

ALTER TABLE public.devo_assignments
  ADD COLUMN IF NOT EXISTS permission_starts_at timestamptz;

CREATE INDEX IF NOT EXISTS devo_assignments_permission_start_idx
  ON public.devo_assignments(permission_starts_at)
  WHERE permission_starts_at IS NOT NULL
    AND status IN ('assigned', 'guide_uploaded', 'scheduled');

-- Backfill from existing schedule + duration.
UPDATE public.devo_assignments
SET permission_starts_at = scheduled_post_at - (COALESCE(permission_duration_days, 7) || ' days')::interval
WHERE scheduled_post_at IS NOT NULL
  AND permission_starts_at IS NULL;

-- Allow service role (cron / edge) to grant Devo Feed access when the window opens.
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
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  IF jwt_role IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR NOT public.has_capability(auth.uid(), 'admin_tools', _resource_app)) THEN
    RAISE EXCEPTION 'Not authorized to grant Devo Feed access';
  END IF;

  SELECT o.granted, o.expires_at, o.note
    INTO existing_granted, existing_expires, existing_note
  FROM public.user_capability_overrides o
  WHERE o.user_id = _user_id
    AND o.capability_key = 'post_feed'
    AND o.resource_app = _resource_app;

  IF existing_granted = true AND existing_expires IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_capability(_user_id, 'post_feed', _resource_app)
     AND (existing_note IS DISTINCT FROM 'Devo assignment') THEN
    RETURN false;
  END IF;

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
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  IF jwt_role IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT (
         public.has_capability(auth.uid(), 'admin_tools', _resource_app)
         OR auth.uid() = _user_id
       )
     ) THEN
    RAISE EXCEPTION 'Not authorized to revoke Devo Feed access';
  END IF;

  SELECT count(*)::integer INTO active_count
  FROM public.devo_assignments a
  WHERE a.assignee_id = _user_id
    AND a.resource_app_key = _resource_app
    AND a.status IN ('assigned', 'guide_uploaded', 'scheduled');

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

NOTIFY pgrst, 'reload schema';
