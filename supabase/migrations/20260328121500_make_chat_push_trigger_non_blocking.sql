create or replace function public.notify_chat_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  supabase_url text;
  service_key text;
  sender_name text;
  campus_name text;
  ministry_label text;
  message_preview text;
  recipient_user_ids jsonb;
begin
  select full_name into sender_name
  from public.profiles
  where id = new.user_id;

  select name into campus_name
  from public.campuses
  where id = new.campus_id;

  ministry_label := case coalesce(new.ministry_type, 'weekend')
    when 'weekend' then 'Weekend'
    when 'encounter' then 'Encounter'
    when 'evident' then 'Evident'
    when 'eon' then 'EON'
    when 'production' then 'Production'
    when 'video' then 'Video'
    else coalesce(new.ministry_type, 'weekend')
  end;

  message_preview := nullif(btrim(coalesce(new.content, '')), '');
  if message_preview is null then
    if coalesce(array_length(new.attachments, 1), 0) > 1 then
      message_preview := 'Sent attachments';
    elsif coalesce(array_length(new.attachments, 1), 0) = 1 then
      message_preview := 'Sent an attachment';
    else
      message_preview := 'Sent a message';
    end if;
  elsif length(message_preview) > 120 then
    message_preview := left(message_preview, 117) || '...';
  end if;

  select jsonb_agg(profile.id::text)
  into recipient_user_ids
  from public.get_profiles_for_chat_mention(new.campus_id, coalesce(new.ministry_type, 'weekend')) as profile
  where profile.id is not null
    and profile.id <> new.user_id;

  if recipient_user_ids is null or jsonb_array_length(recipient_user_ids) = 0 then
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
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', coalesce(sender_name, 'Someone') || ' in ' || trim(coalesce(campus_name, 'your campus') || ' ' || ministry_label),
        'message', message_preview,
        'url', '/chat',
        'tag', 'chat-message-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'chat-message',
        'contextId', new.id::text,
        'createdBy', new.user_id::text,
        'metadata', jsonb_build_object(
          'campusId', new.campus_id,
          'ministryType', new.ministry_type,
          'messageId', new.id
        )
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
