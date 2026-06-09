-- Route new chat message pushes through notify-chat-message so delivery is scoped
-- to the campus/ministry chat roster (get_profiles_for_chat_mention).

create or replace function public.notify_chat_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supabase_url text;
  service_key text;
begin
  begin
    supabase_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    supabase_url := null;
  end;

  begin
    service_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    service_key := null;
  end;

  if supabase_url is null or service_key is null then
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
      supabase_url := null;
      service_key := null;
    end;
  end if;

  if supabase_url is null or service_key is null then
    raise warning 'notify_chat_message_insert skipped for % because Supabase config is missing', new.id;
    return new;
  end if;

  begin
    perform net.http_post(
      url := supabase_url || '/functions/v1/notify-chat-message',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'messageId', new.id::text,
        'resourceAppKey', new.resource_app_key
      )
    );
  exception when others then
    raise warning 'notify_chat_message_insert push dispatch failed for %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'notify_chat_message_insert failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_chat_message_notify_push on public.chat_messages;

create trigger on_chat_message_notify_push
after insert on public.chat_messages
for each row
execute function public.notify_chat_message_insert();

-- Scope @everyone/@all/@team mention pushes to the chat roster as well.
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

  begin
    supabase_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    supabase_url := null;
  end;

  begin
    service_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    service_key := null;
  end;

  if supabase_url is null or service_key is null then
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
          'resourceAppKey', new.resource_app_key
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
