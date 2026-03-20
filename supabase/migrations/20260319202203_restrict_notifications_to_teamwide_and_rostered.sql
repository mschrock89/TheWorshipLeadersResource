drop trigger if exists on_set_published_notify on public.draft_sets;

create or replace function public.notify_new_event()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  event_title text;
  event_date date;
  campus_user_ids jsonb;
  supabase_url text;
  service_key text;
  normalized_audience text;
begin
  event_title := new.title;
  event_date := new.event_date;
  normalized_audience := coalesce(new.audience_type, 'volunteers_only');

  if normalized_audience not in ('volunteers_only', 'volunteer_and_spouse') then
    return new;
  end if;

  if new.campus_id is not null then
    select jsonb_agg(user_id::text)
    into campus_user_ids
    from user_campuses
    where campus_id = new.campus_id;
  else
    campus_user_ids := null;
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

  if (campus_user_ids is not null or new.campus_id is null) and supabase_url is not null and service_key is not null then
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'New Event',
        'message', event_title || ' on ' || to_char(event_date, 'Mon DD, YYYY'),
        'url', '/calendar',
        'tag', 'event-' || new.id::text,
        'userIds', campus_user_ids
      )
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_new_event failed: %', sqlerrm;
  return new;
end;
$function$;
