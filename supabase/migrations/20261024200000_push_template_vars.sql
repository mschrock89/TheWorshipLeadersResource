-- Pass name, date, and role fillers into push payloads so an admin-edited
-- message template can be filled in when it sends.

create or replace function public.notify_new_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_title text;
  event_date date;
  event_campus_ids uuid[];
  event_ministry_types text[];
  weekend_aliases constant text[] := array['weekend', 'weekend_team', 'sunday_am'];
  has_weekend_scope boolean;
  recipient_user_ids jsonb;
  supabase_url text;
  service_key text;
  campus_label text;
  ministry_label text;
  time_label text;
begin
  event_title := new.title;
  event_date := new.event_date;
  event_campus_ids := coalesce(
    new.campus_ids,
    case when new.campus_id is not null then array[new.campus_id] else '{}'::uuid[] end
  );
  event_ministry_types := coalesce(
    new.ministry_types,
    case when new.ministry_type is not null then array[new.ministry_type] else '{}'::text[] end
  );
  has_weekend_scope := event_ministry_types && weekend_aliases;

  if coalesce(array_length(event_campus_ids, 1), 0) > 0 and coalesce(array_length(event_ministry_types, 1), 0) > 0 then
    select jsonb_agg(distinct scoped_users.user_id::text)
    into recipient_user_ids
    from (
      select umc.user_id
      from public.user_ministry_campuses umc
      where umc.campus_id = any(event_campus_ids)
        and (
          umc.ministry_type = any(event_ministry_types)
          or (has_weekend_scope and umc.ministry_type = any(weekend_aliases))
        )
    ) scoped_users
    where scoped_users.user_id <> new.created_by;
  elsif coalesce(array_length(event_campus_ids, 1), 0) > 0 then
    select jsonb_agg(distinct campus_users.user_id::text)
    into recipient_user_ids
    from (
      select uc.user_id
      from public.user_campuses uc
      where uc.campus_id = any(event_campus_ids)
    ) campus_users
    where campus_users.user_id <> new.created_by;
  elsif coalesce(array_length(event_ministry_types, 1), 0) > 0 then
    select jsonb_agg(distinct ministry_users.user_id::text)
    into recipient_user_ids
    from (
      select umc.user_id
      from public.user_ministry_campuses umc
      where umc.ministry_type = any(event_ministry_types)
        or (has_weekend_scope and umc.ministry_type = any(weekend_aliases))
    ) ministry_users
    where ministry_users.user_id <> new.created_by;
  else
    select jsonb_agg(distinct push_subscriptions.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions
    where push_subscriptions.user_id is not null
      and push_subscriptions.user_id <> new.created_by;
  end if;

  if recipient_user_ids is null or jsonb_array_length(recipient_user_ids) = 0 then
    return new;
  end if;

  campus_label := case
    when coalesce(array_length(event_campus_ids, 1), 0) = 1 then '1 campus'
    when coalesce(array_length(event_campus_ids, 1), 0) > 1 then array_length(event_campus_ids, 1)::text || ' campuses'
    else 'All campuses'
  end;

  ministry_label := case
    when coalesce(array_length(event_ministry_types, 1), 0) = 1 then initcap(replace(event_ministry_types[1], '_', ' '))
    when coalesce(array_length(event_ministry_types, 1), 0) > 1 then array_length(event_ministry_types, 1)::text || ' ministries'
    else 'All ministries'
  end;

  time_label := case
    when new.start_time is not null then ' at ' || to_char(new.start_time, 'FMHH:MI AM')
    else ''
  end;

  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  if supabase_url is null or service_key is null then
    begin
      select decrypted_secret
      into supabase_url
      from vault.decrypted_secrets
      where name = 'supabase_url'
      limit 1;

      select decrypted_secret
      into service_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
    exception when others then
      return new;
    end;
  end if;

  if supabase_url is null or service_key is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'New Event',
        'message', event_title || ' • ' || campus_label || ' • ' || ministry_label || ' on ' || to_char(event_date, 'Mon DD, YYYY') || time_label,
        'url', '/calendar',
        'tag', 'event-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'event',
        'contextId', new.id::text,
        'createdBy', new.created_by::text,
        'metadata', jsonb_build_object(
          'eventId', new.id,
          'campusIds', event_campus_ids,
          'ministryTypes', event_ministry_types,
          'eventDate', event_date,
          'audienceType', new.audience_type,
          'resourceAppKey', 'worship',
          'vars', jsonb_build_object(
            'title', event_title,
            'campus', campus_label,
            'ministry', ministry_label,
            'date', to_char(event_date, 'Mon DD, YYYY'),
            'time', time_label
          )
        )
      )
    );
  exception when others then
    raise warning 'notify_new_event failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.notify_break_request_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requester_name text;
  period_name text;
  request_type_label text;
  recipient_user_ids jsonb;
  supabase_url text;
  service_key text;
  period_campus_id uuid;
begin
  if new.request_scope = 'blackout_dates' then
    return new;
  end if;

  select full_name into requester_name from profiles where id = new.user_id;
  select name, campus_id into period_name, period_campus_id from rotation_periods where id = new.rotation_period_id;

  request_type_label := case
    when new.request_type = 'willing_break' then 'is willing to take a break'
    else 'needs a break'
  end;

  if period_campus_id is null then
    recipient_user_ids := jsonb_build_array(
      'dd1c6bc4-c527-4fa0-8ca1-8ed50a2674f9',
      '22c10f05-955a-498c-b18f-2ac570868b35'
    );
  else
    select jsonb_agg(distinct recipient_id)
    into recipient_user_ids
    from (
      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role in ('admin', 'network_worship_pastor', 'network_worship_leader')

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role = 'campus_worship_pastor'
        and shares_campus_with(ur.user_id, new.user_id)

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      join public.user_campuses uc
        on uc.user_id = new.user_id
      where ur.role = 'campus_admin'
        and ur.admin_campus_id = uc.campus_id
    ) recipients;
  end if;

  begin
    select decrypted_secret into supabase_url
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;

    select decrypted_secret into service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception when others then
    return new;
  end;

  if recipient_user_ids is not null and jsonb_array_length(recipient_user_ids) > 0
     and supabase_url is not null and service_key is not null then
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Break Request',
        'message', coalesce(requester_name, 'Someone') || ' ' || request_type_label || ' for ' || coalesce(period_name, 'a rotation period'),
        'url', '/team-builder',
        'tag', 'break-request-' || new.id::text,
        'userIds', recipient_user_ids,
        'metadata', jsonb_build_object(
          'resourceAppKey', 'worship',
          'vars', jsonb_build_object(
            'name', coalesce(requester_name, 'Someone'),
            'request_phrase', request_type_label,
            'period', coalesce(period_name, 'this trimester')
          )
        )
      )
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_break_request_created failed: %', sqlerrm;
  return new;
end;
$function$;

create or replace function public.notify_drum_tech_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supabase_url text;
  service_key text;
  recipient_user_ids jsonb;
  author_name text;
  campus_name text;
  message_preview text;
begin
  select jsonb_agg(distinct ps.user_id::text)
  into recipient_user_ids
  from public.push_subscriptions ps
  inner join public.user_campus_ministry_positions ucmp
    on ucmp.user_id = ps.user_id
   and ucmp.campus_id = new.campus_id
  where ps.user_id is not null
    and ps.user_id <> new.user_id
    and ucmp.position in ('drums', 'drum_tech');

  if recipient_user_ids is null or jsonb_array_length(recipient_user_ids) = 0 then
    return new;
  end if;

  select full_name
  into author_name
  from public.profiles
  where id = new.user_id;

  select name
  into campus_name
  from public.campuses
  where id = new.campus_id;

  message_preview :=
    case
      when length(coalesce(new.body, '')) > 100 then left(new.body, 97) || '...'
      else coalesce(new.body, 'New message')
    end;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('notify_drum_tech_comment_insert') c;

  if supabase_url is null or service_key is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'New Drum Tech message',
        'message', coalesce(nullif(btrim(author_name), ''), 'Someone') || ' posted in ' ||
          coalesce(nullif(btrim(campus_name), ''), 'Drum Tech') || ': ' || message_preview,
        'url', '/drum-tech',
        'tag', 'drum-tech-comment-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'drum-tech-comment',
        'contextId', new.id::text,
        'createdBy', new.user_id::text,
        'metadata', jsonb_build_object(
          'commentId', new.id,
          'campusId', new.campus_id,
          'resourceAppKey', 'worship',
          'vars', jsonb_build_object(
            'author', coalesce(nullif(btrim(author_name), ''), 'Someone'),
            'campus', coalesce(nullif(btrim(campus_name), ''), 'Drum Tech'),
            'preview', message_preview
          )
        )
      )
    );
  exception when others then
    raise warning 'notify_drum_tech_comment_insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'notify_drum_tech_comment_insert failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.notify_chat_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  mentioned_user_id uuid;
  mentioned_user_ids jsonb := '[]'::jsonb;
  match_result text[];
  supabase_url text;
  service_key text;
begin
  select full_name into sender_name
  from public.profiles
  where id = new.user_id;

  for match_result in
    select regexp_matches(new.content, '@\[[^\]]+\]\(([0-9a-f-]{36})\)', 'gi')
  loop
    mentioned_user_id := match_result[1]::uuid;
    if mentioned_user_id <> new.user_id
      and exists (
        select 1
        from public.get_profiles_for_chat_mention(new.campus_id, coalesce(new.ministry_type, 'weekend')) as profile
        where profile.id = mentioned_user_id
      ) then
      mentioned_user_ids := mentioned_user_ids || jsonb_build_array(mentioned_user_id::text);
    end if;
  end loop;

  if new.content ~* '@(everyone|all|team)\b' then
    select coalesce(jsonb_agg(profile.id::text), '[]'::jsonb)
    into mentioned_user_ids
    from public.get_profiles_for_chat_mention(new.campus_id, coalesce(new.ministry_type, 'weekend')) as profile
    where profile.id is not null
      and profile.id <> new.user_id;
  end if;

  if jsonb_array_length(mentioned_user_ids) = 0 then
    return new;
  end if;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('notify_chat_mention') c;

  if supabase_url is null or service_key is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', coalesce(sender_name, 'Someone') || ' mentioned you',
        'message', case
          when length(new.content) > 100 then left(new.content, 100) || '...'
          else new.content
        end,
        'url', '/chat',
        'tag', 'chat-mention-' || new.id::text,
        'userIds', mentioned_user_ids,
        'contextType', 'chat-mention',
        'contextId', new.id::text,
        'createdBy', new.user_id::text,
        'metadata', jsonb_build_object(
          'campusId', new.campus_id,
          'ministryType', new.ministry_type,
          'messageId', new.id,
          'resourceAppKey', new.resource_app_key,
          'vars', jsonb_build_object(
            'sender', coalesce(sender_name, 'Someone'),
            'preview', case
              when length(coalesce(new.content, '')) > 100 then left(new.content, 100) || '...'
              else coalesce(new.content, '')
            end
          )
        )
      )
    );
  exception when others then
    raise warning 'notify_chat_mention push dispatch failed for %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'notify_chat_mention failed: %', sqlerrm;
  return new;
end;
$$;

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

  metadata := metadata || jsonb_build_object(
    'vars', jsonb_build_object(
      'author', COALESCE(NULLIF(btrim(author_name), ''), 'Someone'),
      'title_preview', CASE
        WHEN length(COALESCE(NEW.title, '')) > 100 THEN left(NEW.title, 97) || '...'
        ELSE COALESCE(NEW.title, 'New post')
      END
    )
  );

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

    push_metadata := push_metadata || jsonb_build_object(
      'vars', jsonb_build_object(
        'accepter', coalesce(nullif(btrim(accepter_name), ''), 'Someone'),
        'requester', coalesce(nullif(btrim(requester_name), ''), 'Someone'),
        'date', request_date
      )
    );

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
