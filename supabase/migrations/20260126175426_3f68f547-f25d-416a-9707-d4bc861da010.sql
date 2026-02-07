-- Update the notify_break_request_created function to include admin role holders
CREATE OR REPLACE FUNCTION public.notify_break_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requester_name TEXT;
  period_name TEXT;
  request_type_label TEXT;
  recipient_user_ids JSONB;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.user_id;
  
  -- Get rotation period name
  SELECT name INTO period_name FROM rotation_periods WHERE id = NEW.rotation_period_id;
  
  -- Format request type for display
  request_type_label := CASE 
    WHEN NEW.request_type = 'willing_break' THEN 'is willing to take a break'
    ELSE 'needs a break'
  END;
  
  -- Find Admins (global) and Campus Worship Pastors (campus-scoped) to notify
  SELECT jsonb_agg(DISTINCT ur.user_id::text)
  INTO recipient_user_ids
  FROM user_roles ur
  WHERE 
    -- Global admins always get notified
    ur.role = 'admin'
    OR
    -- Campus Worship Pastors only for their campus
    (ur.role = 'campus_worship_pastor' AND shares_campus_with(ur.user_id, NEW.user_id));
  
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
  
  -- Only send if there are recipients to notify and we have credentials
  IF recipient_user_ids IS NOT NULL AND jsonb_array_length(recipient_user_ids) > 0 
     AND supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Break Request',
        'message', COALESCE(requester_name, 'Someone') || ' ' || request_type_label || ' for ' || COALESCE(period_name, 'a rotation period'),
        'url', '/team-builder',
        'tag', 'break-request-' || NEW.id::text,
        'userIds', recipient_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_break_request_created failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;