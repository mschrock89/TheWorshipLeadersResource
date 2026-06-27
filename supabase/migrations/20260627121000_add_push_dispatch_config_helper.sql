-- Centralised config lookup for trigger-based push dispatch.
--
-- Every push trigger previously inlined the same two-tier lookup
-- (current_setting('app.settings.*') then vault.decrypted_secrets) and several
-- of them swallowed a missing-config situation silently. That made it
-- impossible to tell from the logs why chat / feed / drum-tech pushes were not
-- firing. This helper does the lookup once and RAISES A WARNING (not silent)
-- when the config is missing, so the failure is visible in Postgres logs.

create or replace function public.push_dispatch_config(p_context text default 'push')
returns table(supabase_url text, service_key text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  begin
    v_url := current_setting('app.settings.supabase_url', true);
  exception when others then
    v_url := null;
  end;

  begin
    v_key := current_setting('app.settings.service_role_key', true);
  exception when others then
    v_key := null;
  end;

  if v_url is null or v_key is null then
    begin
      select decrypted_secret into v_url
      from vault.decrypted_secrets
      where name = 'supabase_url'
      limit 1;

      select decrypted_secret into v_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
    exception when others then
      v_url := null;
      v_key := null;
    end;
  end if;

  if v_url is null or v_key is null then
    raise warning '[push_dispatch_config] % skipped: missing Supabase config. Set app.settings.supabase_url / app.settings.service_role_key or vault secrets supabase_url / service_role_key.', p_context;
  end if;

  supabase_url := v_url;
  service_key := v_key;
  return next;
end;
$$;

grant execute on function public.push_dispatch_config(text) to service_role;

-- ── Refactor chat message trigger ────────────────────────────────────────────
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
  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('notify_chat_message_insert') c;

  if supabase_url is null or service_key is null then
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

-- ── Refactor chat mention trigger ────────────────────────────────────────────
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

-- ── Refactor feed post trigger ───────────────────────────────────────────────
create or replace function public.notify_feed_post_insert()
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
  notification_message text;
begin
  select jsonb_agg(distinct push_subscriptions.user_id::text)
  into recipient_user_ids
  from public.push_subscriptions
  where push_subscriptions.user_id is not null
    and push_subscriptions.user_id <> new.created_by
    and (
      new.resource_app_key is null
      or push_subscriptions.resource_app_key is null
      or push_subscriptions.resource_app_key = new.resource_app_key
    );

  if recipient_user_ids is null or jsonb_array_length(recipient_user_ids) = 0 then
    return new;
  end if;

  select full_name
  into author_name
  from public.profiles
  where id = new.created_by;

  notification_message := coalesce(nullif(btrim(author_name), ''), 'Someone') || ' shared: ' ||
    case
      when length(coalesce(new.title, '')) > 100 then left(new.title, 97) || '...'
      else coalesce(new.title, 'New post')
    end;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('notify_feed_post_insert') c;

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
        'title', 'New Post in The Feed',
        'message', notification_message,
        'url', '/feed',
        'tag', 'feed-post-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'feed-post',
        'contextId', new.id::text,
        'createdBy', new.created_by::text,
        'metadata', jsonb_build_object(
          'postId', new.id,
          'category', new.category,
          'resourceAppKey', new.resource_app_key
        )
      )
    );
  exception when others then
    raise warning 'notify_feed_post_insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
exception when others then
  raise warning 'notify_feed_post_insert failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ── Refactor drum tech comment trigger ───────────────────────────────────────
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
          'campusId', new.campus_id
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
