-- Update the notify_new_event function to filter by campus
CREATE OR REPLACE FUNCTION public.notify_new_event()
RETURNS TRIGGER AS $$
DECLARE
  event_title TEXT;
  event_date DATE;
  campus_user_ids JSONB;
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
  
  -- Only send if there are users to notify
  IF campus_user_ids IS NOT NULL OR NEW.campus_id IS NULL THEN
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
        'tag', 'event-' || NEW.id::text,
        'userIds', campus_user_ids
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the notify_published_set function to filter by campus
CREATE OR REPLACE FUNCTION public.notify_published_set()
RETURNS TRIGGER AS $$
DECLARE
  set_campus_name TEXT;
  set_date DATE;
  set_ministry TEXT;
  campus_user_ids JSONB;
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
    
    -- Only send if there are users to notify
    IF campus_user_ids IS NOT NULL THEN
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
          'tag', 'set-' || NEW.id::text,
          'userIds', campus_user_ids
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;