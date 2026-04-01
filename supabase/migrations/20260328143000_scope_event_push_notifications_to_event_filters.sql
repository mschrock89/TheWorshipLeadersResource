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
          'audienceType', new.audience_type
        )
      )
    );
  exception when others then
    raise warning 'notify_new_event failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
