-- Scheduled Feed posts: writers can submit early; posts appear at goes_live_at.
-- Also allow DEVO assignment status "scheduled".

ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS goes_live_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS feed_posts_goes_live_pending_idx
  ON public.feed_posts(goes_live_at)
  WHERE goes_live_at IS NOT NULL
    AND go_live_notified_at IS NULL;

-- Public feed: hide future-dated posts from everyone except the author / feed admins.
DROP POLICY IF EXISTS "Authenticated users can view feed posts" ON public.feed_posts;
CREATE POLICY "Authenticated users can view feed posts"
  ON public.feed_posts
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      goes_live_at IS NULL
      OR goes_live_at <= now()
      OR created_by = auth.uid()
      OR public.has_capability(auth.uid(), 'post_feed', resource_app_key)
      OR public.has_capability(auth.uid(), 'admin_tools', resource_app_key)
    )
  );

-- Skip insert-time push for posts that are not live yet.
CREATE OR REPLACE FUNCTION public.notify_feed_post_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_key text;
  recipient_user_ids jsonb;
  author_name text;
  notification_message text;
  camp_resource_app_keys text[];
BEGIN
  -- Scheduled posts notify when they actually go live (edge cron).
  IF NEW.goes_live_at IS NOT NULL AND NEW.goes_live_at > now() THEN
    RETURN NEW;
  END IF;

  IF NEW.camp_instance_id IS NOT NULL THEN
    SELECT ci.resource_app_keys
    INTO camp_resource_app_keys
    FROM public.camp_instances ci
    WHERE ci.id = NEW.camp_instance_id;

    SELECT jsonb_agg(DISTINCT ps.user_id::text)
    INTO recipient_user_ids
    FROM public.push_subscriptions ps
    WHERE ps.user_id IS NOT NULL
      AND ps.user_id <> NEW.created_by
      AND ps.resource_app_key = ANY(COALESCE(camp_resource_app_keys, '{}'::text[]))
      AND public.user_can_access_camp_instance(ps.user_id, NEW.camp_instance_id);
  ELSIF NEW.campus_id IS NOT NULL THEN
    SELECT jsonb_agg(DISTINCT ps.user_id::text)
    INTO recipient_user_ids
    FROM public.push_subscriptions ps
    WHERE ps.user_id IS NOT NULL
      AND ps.user_id <> NEW.created_by
      AND ps.resource_app_key = NEW.resource_app_key
      AND EXISTS (
        SELECT 1
        FROM public.user_campuses uc
        WHERE uc.user_id = ps.user_id
          AND uc.campus_id = NEW.campus_id
      );
  ELSE
    SELECT jsonb_agg(DISTINCT ps.user_id::text)
    INTO recipient_user_ids
    FROM public.push_subscriptions ps
    WHERE ps.user_id IS NOT NULL
      AND ps.user_id <> NEW.created_by
      AND ps.resource_app_key = NEW.resource_app_key;
  END IF;

  IF recipient_user_ids IS NULL OR jsonb_array_length(recipient_user_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT full_name
  INTO author_name
  FROM public.profiles
  WHERE id = NEW.created_by;

  notification_message := COALESCE(NULLIF(btrim(author_name), ''), 'Someone') || ' shared: ' ||
    CASE
      WHEN length(COALESCE(NEW.title, '')) > 100 THEN left(NEW.title, 97) || '...'
      ELSE COALESCE(NEW.title, 'New post')
    END;

  SELECT c.supabase_url, c.service_key
  INTO supabase_url, service_key
  FROM public.push_dispatch_config('notify_feed_post_insert') c;

  IF supabase_url IS NULL OR service_key IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', CASE WHEN NEW.camp_instance_id IS NOT NULL THEN 'New Camp Feed Post' ELSE 'New Post in The Feed' END,
        'message', notification_message,
        'url', CASE WHEN NEW.camp_instance_id IS NOT NULL THEN '/camp' ELSE '/feed' END,
        'tag', 'feed-post-' || NEW.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'feed-post',
        'contextId', NEW.id::text,
        'createdBy', NEW.created_by::text,
        'metadata', jsonb_build_object(
          'postId', NEW.id,
          'category', NEW.category,
          'resourceAppKey', NEW.resource_app_key,
          'campInstanceId', NEW.camp_instance_id,
          'campusId', NEW.campus_id
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_feed_post_insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- DEVO assignment status: scheduled = written, waiting for go-live.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'devo_assignments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.devo_assignments DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.devo_assignments
  ADD CONSTRAINT devo_assignments_status_check
  CHECK (status IN ('assigned', 'guide_uploaded', 'scheduled', 'posted', 'cancelled'));

-- Update assign push copy guidance (optional template refresh).
UPDATE public.push_notification_definitions
SET
  body_template = 'Goes live {{post_day}} at {{post_time}}. Open your profile badge → DEVO → write your post anytime before then. It publishes to The Feed automatically at that time.',
  description = 'Sent when someone is assigned to write a devotion. They can write early; the post goes live at the scheduled time.'
WHERE key = 'devo-assigned';

UPDATE public.push_notification_definitions
SET
  body_template = 'Your {{chapter}} DEVO is going live now on The Feed. Open The Feed to see it — or finish writing in DEVO if you have not yet.',
  description = 'Reminder at the scheduled go-live time for a DEVO assignment.'
WHERE key = 'devo-post-reminder';

NOTIFY pgrst, 'reload schema';
