-- Create a function to send push notifications via Edge Function
CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS TRIGGER AS $$
DECLARE
  event_campus_id UUID;
  event_title TEXT;
  event_date DATE;
BEGIN
  -- Get event details
  event_campus_id := NEW.campus_id;
  event_title := NEW.title;
  event_date := NEW.event_date;
  
  -- Call the edge function via pg_net (async HTTP call)
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'title', 'New Event',
      'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
      'url', '/calendar',
      'tag', 'event-' || NEW.id::text
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create a function to notify when sets are published
CREATE OR REPLACE FUNCTION public.notify_published_set()
RETURNS TRIGGER AS $$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
BEGIN
  -- Only trigger when status changes to 'published'
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    -- Get campus name
    SELECT name INTO set_campus_name FROM campuses WHERE id = NEW.campus_id;
    
    set_date := NEW.plan_date;
    set_ministry := NEW.ministry_type;
    
    -- Call the edge function via pg_net
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'title', 'New Set Published',
        'message', COALESCE(set_campus_name, '') || ' ' || set_ministry || ' set for ' || to_char(set_date, 'Mon DD, YYYY'),
        'url', '/set-planner',
        'tag', 'set-' || NEW.id::text
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER on_new_event_notify
AFTER INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_event();

CREATE TRIGGER on_set_published_notify
AFTER INSERT OR UPDATE ON public.draft_sets
FOR EACH ROW
EXECUTE FUNCTION public.notify_published_set();