-- Audience push when a DEVO goes live on The Feed.
-- Recipients: users assigned to that campus Feed (ministry via user_ministry_campuses).
-- Also skip the generic insert-time feed-post push for any scheduled post (including
-- DEVO writes that are already past go-live); cron / notify-feed-post handle those.

INSERT INTO public.push_notification_definitions (
  key, label, category, description, trigger_description, recipients_description,
  title_template, body_template, deep_link_url, template_variables,
  enabled, content_from_db, is_system, sort_order
) VALUES (
  'devo-live',
  'DEVO Live',
  'DEVO',
  'Sent to people on a Feed when a DEVO assignment goes live there.',
  'DEVO feed post reaches its scheduled go-live time (cron), or is posted after go-live',
  'Users assigned to that campus Feed (matching ministry), excluding the author',
  'New DEVO is live',
  '{{author}} shared {{chapter}}: {{title_preview}}',
  '/feed',
  ARRAY['author', 'chapter', 'title_preview', 'series_title'],
  true,
  true,
  true,
  225
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  trigger_description = EXCLUDED.trigger_description,
  recipients_description = EXCLUDED.recipients_description,
  title_template = EXCLUDED.title_template,
  body_template = EXCLUDED.body_template,
  deep_link_url = EXCLUDED.deep_link_url,
  template_variables = EXCLUDED.template_variables,
  content_from_db = EXCLUDED.content_from_db,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

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
  -- Scheduled / DEVO posts notify when they actually go live (edge cron or client).
  IF NEW.goes_live_at IS NOT NULL THEN
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

NOTIFY pgrst, 'reload schema';
