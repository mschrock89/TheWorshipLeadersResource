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

  if supabase_url is null then
    begin
      supabase_url := current_setting('app.settings.supabase_url', true);
    exception when others then
      supabase_url := null;
    end;
  end if;

  if service_key is null then
    begin
      service_key := current_setting('app.settings.service_role_key', true);
    exception when others then
      service_key := null;
    end;
  end if;

  if supabase_url is null or service_key is null then
    raise warning 'notify_chat_message_insert skipped for % because Supabase config is missing', new.id;
    return new;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/notify-chat-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'messageId', new.id::text
    )
  );

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
