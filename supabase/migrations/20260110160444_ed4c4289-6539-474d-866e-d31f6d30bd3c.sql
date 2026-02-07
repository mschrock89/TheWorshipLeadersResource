-- Create a function to notify when swap requests are created
CREATE OR REPLACE FUNCTION public.notify_swap_request_created()
RETURNS TRIGGER AS $$
DECLARE
  requester_name TEXT;
  request_date TEXT;
BEGIN
  -- Get requester name
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
  
  request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
  
  -- Call the edge function via pg_net
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a function to notify when swap requests are accepted or declined
CREATE OR REPLACE FUNCTION public.notify_swap_request_resolved()
RETURNS TRIGGER AS $$
DECLARE
  accepter_name TEXT;
  request_date TEXT;
  notification_title TEXT;
  notification_message TEXT;
BEGIN
  -- Only trigger when status changes to accepted or declined
  IF NEW.status IN ('accepted', 'declined') AND OLD.status = 'pending' THEN
    request_date := to_char(NEW.original_date::date, 'Mon DD, YYYY');
    
    IF NEW.status = 'accepted' THEN
      -- Get accepter name
      SELECT full_name INTO accepter_name FROM profiles WHERE id = NEW.accepted_by_id;
      notification_title := 'Swap Accepted';
      notification_message := COALESCE(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    ELSE
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    END IF;
    
    -- Notify the requester
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER on_swap_request_created_notify
AFTER INSERT ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_swap_request_created();

CREATE TRIGGER on_swap_request_resolved_notify
AFTER UPDATE ON public.swap_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_swap_request_resolved();