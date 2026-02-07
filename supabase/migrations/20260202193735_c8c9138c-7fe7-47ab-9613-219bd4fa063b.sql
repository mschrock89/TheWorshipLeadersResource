-- Update the notify_swap_request_resolved function to also notify campus admins
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  accepter_name TEXT;
  requester_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
  supabase_url TEXT;
  service_key TEXT;
  swap_campus_id UUID;
  swap_ministry_type TEXT;
  campus_admin_ids JSONB;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    -- Get the campus_id and ministry_type from team_schedule for this swap
    SELECT ts.campus_id, ts.ministry_type 
    INTO swap_campus_id, swap_ministry_type
    FROM team_schedule ts
    WHERE ts.team_id = NEW.team_id
      AND ts.schedule_date = NEW.original_date
    LIMIT 1;
    
    IF NEW.status = 'accepted' THEN
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
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
          'tag', 'swap-resolved-' || NEW.id::text,
          'userIds', jsonb_build_array(NEW.requester_id::text)
        )
      );
      
      -- If accepted, also notify campus admins for this campus
      IF NEW.status = 'accepted' AND swap_campus_id IS NOT NULL THEN
        -- Find campus_admin users for this specific campus
        SELECT jsonb_agg(DISTINCT ur.user_id::text)
        INTO campus_admin_ids
        FROM user_roles ur
        WHERE ur.role = 'campus_admin'
          AND ur.admin_campus_id = swap_campus_id
          AND ur.user_id != NEW.requester_id
          AND ur.user_id != NEW.accepted_by_id;
        
        -- Send notification to campus admins if any exist
        IF campus_admin_ids IS NOT NULL AND jsonb_array_length(campus_admin_ids) > 0 THEN
          PERFORM net.http_post(
            url := supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
              'title', 'Swap Confirmed',
              'message', COALESCE(accepter_name, 'Someone') || ' is covering for ' || COALESCE(requester_name, 'a team member') || ' on ' || request_date,
              'url', '/swaps',
              'tag', 'swap-admin-' || NEW.id::text,
              'userIds', campus_admin_ids
            )
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_swap_request_resolved failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;