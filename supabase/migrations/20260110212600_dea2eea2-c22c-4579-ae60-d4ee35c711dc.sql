-- Fix the notify_swap_request_created trigger to handle missing config gracefully
CREATE OR REPLACE FUNCTION public.notify_swap_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requester_name TEXT;
  request_date TEXT;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
  
  request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
  
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
  
  -- Only proceed if we have both values
  IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Swap Request',
        'message', COALESCE(requester_name, 'Someone') || ' needs coverage on ' || request_date,
        'url', '/swaps',
        'tag', 'swap-created-' || NEW.id::text,
        'userIds', CASE 
          WHEN NEW.target_user_id IS NOT NULL THEN jsonb_build_array(NEW.target_user_id::text)
          ELSE NULL
        END
      )
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the insert
  RAISE WARNING 'notify_swap_request_created failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Fix the notify_swap_request_resolved trigger
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  accepter_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    IF NEW.status = 'accepted' THEN
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      notification_title := 'Swap Accepted';
      notification_message := COALESCE(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
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
      RETURN NEW;
    END;
    
    -- Only proceed if we have both values
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
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
          'tag', 'swap-resolved-' || NEW.id::text,
          'userIds', jsonb_build_array(NEW.requester_id::text)
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_swap_request_resolved failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;