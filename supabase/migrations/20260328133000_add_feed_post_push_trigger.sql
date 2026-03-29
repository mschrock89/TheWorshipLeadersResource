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
    and push_subscriptions.user_id <> new.created_by;

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
          'category', new.category
        )
      )
    );
  exception when others then
    raise warning 'notify_feed_post_insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_feed_post_insert_notify on public.feed_posts;

create trigger on_feed_post_insert_notify
after insert on public.feed_posts
for each row
execute function public.notify_feed_post_insert();
