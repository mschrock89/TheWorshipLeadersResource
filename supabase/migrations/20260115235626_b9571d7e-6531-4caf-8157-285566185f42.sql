-- Fix notify_published_set trigger to use vault secrets instead of app.settings
CREATE OR REPLACE FUNCTION public.notify_published_set()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
  campus_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get campus name
    SELECT name INTO set_campus_name FROM campuses WHERE id = NEW.campus_id;
    
    set_date := NEW.plan_date;
    set_ministry := NEW.ministry_type;
    
    -- Get user IDs for the set's campus
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
    
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
      -- If vault access fails, skip the notification silently
      RETURN NEW;
    END;
    
    -- Only send if there are users to notify and we have credentials
    IF campus_user_ids IS NOT NULL AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', 'New Set Published',
          'message', COALESCE(set_campus_name, '') || ' ' || set_ministry || ' set for ' || to_char(set_date, 'Mon DD, YYYY'),
          'url', '/set-planner',
          'tag', 'set-' || NEW.id::text,
          'userIds', campus_user_ids
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't let notification failures block the publish
  RAISE WARNING 'notify_published_set failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Also fix notify_new_event and notify_chat_mention triggers that have the same issue
CREATE OR REPLACE FUNCTION public.notify_new_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_title TEXT;
  event_date DATE;
  campus_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  event_title := NEW.title;
  event_date := NEW.event_date;
  
  -- Get user IDs for the event's campus (or all users if no campus specified)
  IF NEW.campus_id IS NOT NULL THEN
    SELECT jsonb_agg(user_id::text)
    INTO campus_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id;
  ELSE
    -- No campus filter, don't specify userIds (sends to all)
    campus_user_ids := NULL;
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
    RETURN NEW;
  END;
  
  -- Only send if there are users to notify and we have credentials
  IF (campus_user_ids IS NOT NULL OR NEW.campus_id IS NULL) AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'New Event',
        'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
        'url', '/calendar',
        'tag', 'event-' || NEW.id::text,
        'userIds', campus_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_event failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_chat_mention()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sender_name TEXT;
  campus_name TEXT;
  mentioned_user_id UUID;
  mentioned_user_ids JSONB := '[]'::jsonb;
  mention_pattern TEXT;
  match_result TEXT[];
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get campus name if available
  IF NEW.campus_id IS NOT NULL THEN
    SELECT name INTO campus_name FROM campuses WHERE id = NEW.campus_id;
  END IF;
  
  -- Find all @mentions in the message content
  -- Pattern matches @[Name](user_id) format commonly used in mention systems
  -- Also matches simple @name patterns
  
  -- First try to find mentions with UUID pattern: @[Name](uuid)
  FOR match_result IN 
    SELECT regexp_matches(NEW.content, '@\[[^\]]+\]\(([0-9a-f-]{36})\)', 'gi')
  LOOP
    mentioned_user_id := match_result[1]::uuid;
    -- Don't notify the sender about their own message
    IF mentioned_user_id != NEW.user_id THEN
      mentioned_user_ids := mentioned_user_ids || jsonb_build_array(mentioned_user_id::text);
    END IF;
  END LOOP;
  
  -- Also check for @everyone or @all mentions - notify all campus members
  IF NEW.content ~* '@(everyone|all|team)\b' THEN
    SELECT jsonb_agg(user_id::text)
    INTO mentioned_user_ids
    FROM user_campuses
    WHERE campus_id = NEW.campus_id
    AND user_id != NEW.user_id;
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
    RETURN NEW;
  END;
  
  -- Send notification if there are mentioned users and we have credentials
  IF jsonb_array_length(mentioned_user_ids) > 0 AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', COALESCE(sender_name, 'Someone') || ' mentioned you',
        'message', CASE 
          WHEN length(NEW.content) > 100 THEN substring(NEW.content, 1, 100) || '...'
          ELSE NEW.content
        END,
        'url', '/chat',
        'tag', 'mention-' || NEW.id::text,
        'userIds', mentioned_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_chat_mention failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;