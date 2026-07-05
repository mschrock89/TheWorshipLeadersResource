-- Scope push-notification triggers to their originating resource app.
--
-- All resource apps (worship / students_hs / students_ms / my_church_resource)
-- share one push_subscriptions table; a person who uses two apps has one row per
-- app. send-push-notification only filters by app when the payload carries
-- metadata.resourceAppKey. These triggers previously omitted it, so a push fired
-- from one app was delivered to every app the recipient had installed.
--
-- Each function below is recreated verbatim from its latest definition, adding
-- only metadata.resourceAppKey:
--   * swap triggers  -> new.resource_app_key (swap_requests carries the column)
--   * published sets, events, break requests, drum-tech -> 'worship'
--     (these features have no resource_app_key column; they are worship-only)
--
-- Already-scoped triggers (notify_chat_message_insert, notify_chat_mention,
-- notify_feed_post_insert) are intentionally left untouched.

-- ---------------------------------------------------------------------------
-- notify_swap_request_created  (from 20260110212600_…)
-- ---------------------------------------------------------------------------
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
        END,
        'metadata', jsonb_build_object('resourceAppKey', COALESCE(NEW.resource_app_key, 'worship'))
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

-- ---------------------------------------------------------------------------
-- notify_swap_request_resolved  (from 20260518120000_…)
-- ---------------------------------------------------------------------------
create or replace function public.notify_swap_request_resolved()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
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
begin
  -- Only trigger when status changes to accepted or declined
  if new.status in ('accepted', 'declined') and old.status = 'pending' then
    request_date := to_char(new.original_date::date, 'Mon DD, YYYY');

    -- Get the campus_id and ministry_type from team_schedule for this swap
    select ts.campus_id, coalesce(ts.ministry_type, 'weekend')
    into swap_campus_id, swap_ministry_type
    from public.team_schedule ts
    where ts.team_id = new.team_id
      and ts.schedule_date = new.original_date
    limit 1;

    normalized_swap_ministry_type := case
      when coalesce(swap_ministry_type, 'weekend') in ('weekend', 'weekend_team', 'sunday_am', 'speaker') then 'weekend_team'
      else coalesce(swap_ministry_type, 'weekend')
    end;

    normalized_position := regexp_replace(lower(coalesce(new.position, '')), '[\s-]+', '_', 'g');

    if new.status = 'accepted' then
      select full_name into accepter_name from public.profiles where id = new.accepted_by_id;
      select full_name into requester_name from public.profiles where id = new.requester_id;
      notification_title := 'Swap Accepted';
      notification_message := coalesce(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    else
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    end if;

    -- Try to get the URL and key from vault secrets
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

    -- Only proceed if we have both values
    if supabase_url is not null and service_key is not null then
      -- Notify the requester
      perform net.http_post(
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
          'metadata', jsonb_build_object('resourceAppKey', coalesce(new.resource_app_key, 'worship'))
        )
      );

      -- If accepted, notify only the lead(s) responsible for the swapped position.
      if new.status = 'accepted' and swap_campus_id is not null then
        select jsonb_agg(distinct ur.user_id::text)
        into leader_user_ids
        from public.user_roles ur
        join public.user_ministry_campuses umc
          on umc.user_id = ur.user_id
         and umc.campus_id = swap_campus_id
         and umc.ministry_type = normalized_swap_ministry_type
        where (
            (
              (
                normalized_position in (
                  'front_of_house',
                  'lighting',
                  'broadcast_mix',
                  'producer',
                  'stage_manager',
                  'engineer'
                )
                or (
                  normalized_position not in (
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
                  and normalized_swap_ministry_type = 'production'
                )
              )
              and ur.role = 'production_manager'
            )
            or (
              (
                normalized_position in (
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
                or (
                  normalized_position not in (
                    'front_of_house',
                    'lighting',
                    'broadcast_mix',
                    'producer',
                    'stage_manager',
                    'engineer'
                  )
                  and normalized_swap_ministry_type = 'video'
                )
              )
              and ur.role in ('video_director', 'production_manager')
            )
            or (
              normalized_swap_ministry_type not in ('video', 'production')
              and ur.role in (
                'campus_worship_pastor',
                'student_worship_pastor',
                'network_worship_pastor',
                'network_worship_leader'
              )
            )
          )
          and ur.user_id <> new.requester_id
          and ur.user_id <> new.accepted_by_id;

        if leader_user_ids is not null and jsonb_array_length(leader_user_ids) > 0 then
          perform net.http_post(
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
              'metadata', jsonb_build_object('resourceAppKey', coalesce(new.resource_app_key, 'worship'))
            )
          );
        end if;
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'notify_swap_request_resolved failed: %', sqlerrm;
  return new;
end;
$function$;

-- Note: notify_published_set is intentionally NOT recreated here. Its trigger was
-- disabled and the function neutered to a no-op in
-- 20260519120000_harden_setlist_push_recipient_scope.sql; setlist-published pushes
-- now flow only through the (already-scoped) notify-setlist-published edge function.

-- ---------------------------------------------------------------------------
-- notify_new_event  (from 20260328143000_…) — events are worship-only
-- ---------------------------------------------------------------------------
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
          'resourceAppKey', 'worship'
        )
      )
    );
  exception when others then
    raise warning 'notify_new_event failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- notify_break_request_created  (from 20260406153000_…) — worship-only
-- ---------------------------------------------------------------------------
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
        'metadata', jsonb_build_object('resourceAppKey', 'worship')
      )
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_break_request_created failed: %', sqlerrm;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- notify_drum_tech_comment_insert  (from 20260627121000_…) — worship-only
-- ---------------------------------------------------------------------------
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
          'resourceAppKey', 'worship'
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
