-- Pass ministry context into push payloads so user_push_ministry_prefs can filter.

-- Feed posts: include ministry_type when present.
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
  metadata jsonb;
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

  metadata := jsonb_build_object(
    'postId', NEW.id,
    'category', NEW.category,
    'resourceAppKey', NEW.resource_app_key,
    'campInstanceId', NEW.camp_instance_id,
    'campusId', NEW.campus_id
  );

  IF NEW.ministry_type IS NOT NULL AND btrim(NEW.ministry_type) <> '' THEN
    metadata := metadata || jsonb_build_object('ministryType', NEW.ministry_type);
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
        'metadata', metadata
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_feed_post_insert failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Swap resolve: include ministryType on requester + leader pushes.
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  accepter_name text;
  requester_name text;
  request_date text;
  notification_title text;
  notification_message text;
  supabase_url text;
  service_key text;
  swap_campus_id uuid;
  swap_ministry_type text;
  normalized_swap_ministry_type text;
  normalized_position text;
  leader_user_ids jsonb;
  push_metadata jsonb;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF new.status IN ('accepted', 'declined') AND old.status = 'pending' THEN
    request_date := to_char(new.original_date::date, 'Mon DD, YYYY');

    -- Get the campus_id and ministry_type from team_schedule for this swap
    SELECT ts.campus_id, coalesce(ts.ministry_type, 'weekend')
    INTO swap_campus_id, swap_ministry_type
    FROM public.team_schedule ts
    WHERE ts.team_id = new.team_id
      AND ts.schedule_date = new.original_date
    LIMIT 1;

    normalized_swap_ministry_type := CASE
      WHEN coalesce(swap_ministry_type, 'weekend') IN ('weekend', 'weekend_team', 'sunday_am', 'speaker') THEN 'weekend_team'
      ELSE coalesce(swap_ministry_type, 'weekend')
    END;

    normalized_position := regexp_replace(lower(coalesce(new.position, '')), '[\s-]+', '_', 'g');

    push_metadata := jsonb_build_object(
      'resourceAppKey', coalesce(new.resource_app_key, 'worship'),
      'ministryType', normalized_swap_ministry_type
    );

    IF new.status = 'accepted' THEN
      SELECT full_name INTO accepter_name FROM public.profiles WHERE id = new.accepted_by_id;
      SELECT full_name INTO requester_name FROM public.profiles WHERE id = new.requester_id;
      notification_title := 'Swap Accepted';
      notification_message := coalesce(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    ELSE
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    END IF;

    -- Try to get the URL and key from vault secrets
    BEGIN
      SELECT decrypted_secret INTO supabase_url
      FROM vault.decrypted_secrets
      WHERE name = 'supabase_url'
      LIMIT 1;

      SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key'
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RETURN new;
    END;

    -- Only proceed if we have both values
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      -- Notify the requester
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', notification_title,
          'message', notification_message,
          'url', '/swaps',
          'tag', 'swap-resolved-' || new.id::text,
          'userIds', jsonb_build_array(new.requester_id::text),
          'metadata', push_metadata
        )
      );

      -- If accepted, notify only the lead(s) responsible for the swapped position.
      IF new.status = 'accepted' AND swap_campus_id IS NOT NULL THEN
        SELECT jsonb_agg(DISTINCT ur.user_id::text)
        INTO leader_user_ids
        FROM public.user_roles ur
        JOIN public.user_ministry_campuses umc
          ON umc.user_id = ur.user_id
         AND umc.campus_id = swap_campus_id
         AND umc.ministry_type = normalized_swap_ministry_type
        WHERE (
            (
              (
                normalized_position IN (
                  'front_of_house',
                  'lighting',
                  'broadcast_mix',
                  'producer',
                  'stage_manager',
                  'engineer'
                )
                OR (
                  normalized_position NOT IN (
                    'video_director',
                    'camera_operator',
                    'video_switcher',
                    'pro_presenter',
                    'graphics',
                    'director',
                    'switcher',
                    'tri_pod_camera',
                    'hand_held_camera',
                    'other'
                  )
                  AND normalized_swap_ministry_type = 'production'
                )
              )
              AND ur.role = 'production_manager'
            )
            OR (
              (
                normalized_position IN (
                  'video_director',
                  'camera_operator',
                  'video_switcher',
                  'pro_presenter',
                  'graphics',
                  'director',
                  'switcher',
                  'tri_pod_camera',
                  'hand_held_camera',
                  'other'
                )
                OR (
                  normalized_position NOT IN (
                    'front_of_house',
                    'lighting',
                    'broadcast_mix',
                    'producer',
                    'stage_manager',
                    'engineer'
                  )
                  AND normalized_swap_ministry_type = 'video'
                )
              )
              AND ur.role IN ('video_director', 'production_manager')
            )
            OR (
              normalized_swap_ministry_type NOT IN ('video', 'production')
              AND ur.role IN (
                'campus_worship_pastor',
                'student_worship_pastor',
                'network_worship_pastor',
                'network_worship_leader'
              )
            )
          )
          AND ur.user_id <> new.requester_id
          AND ur.user_id <> new.accepted_by_id;

        IF leader_user_ids IS NOT NULL AND jsonb_array_length(leader_user_ids) > 0 THEN
          PERFORM net.http_post(
            url := supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
              'title', 'Swap Confirmed',
              'message', coalesce(accepter_name, 'Someone') || ' is covering for ' || coalesce(requester_name, 'a team member') || ' on ' || request_date,
              'url', '/swaps',
              'tag', 'swap-leads-' || new.id::text,
              'userIds', leader_user_ids,
              'metadata', push_metadata
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_swap_request_resolved failed: %', sqlerrm;
  RETURN new;
END;
$function$;

NOTIFY pgrst, 'reload schema';
