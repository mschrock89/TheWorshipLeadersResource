-- Create a function to notify users when they are mentioned in chat
CREATE OR REPLACE FUNCTION public.notify_chat_mention()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  campus_name TEXT;
  mentioned_user_id UUID;
  mentioned_user_ids JSONB := '[]'::jsonb;
  mention_pattern TEXT;
  match_result TEXT[];
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
  
  -- Send notification if there are mentioned users
  IF jsonb_array_length(mentioned_user_ids) > 0 THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for chat mentions
CREATE TRIGGER on_chat_mention_notify
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_chat_mention();