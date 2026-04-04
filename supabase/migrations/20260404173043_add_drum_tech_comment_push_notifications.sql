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
end;
$$;

drop trigger if exists on_drum_tech_comment_insert_notify on public.drum_tech_comments;

create trigger on_drum_tech_comment_insert_notify
after insert on public.drum_tech_comments
for each row
execute function public.notify_drum_tech_comment_insert();
