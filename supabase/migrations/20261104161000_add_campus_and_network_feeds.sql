-- Campus Wide and Network Wide feeds.
--
-- A ministry feed stays (resource_app_key, campus_id, ministry_type).
-- Campus Wide uses ministry_type = 'campus_wide' with that campus_id, so every
-- person assigned to the campus sees it.
-- Network Wide uses ministry_type = 'network_wide' and campus_id null, so every
-- user on that resource app sees it.
-- Existing ministry posts are left where they are.

create index if not exists feed_posts_network_created_at_idx
  on public.feed_posts(resource_app_key, created_at desc)
  where camp_instance_id is null
    and campus_id is null
    and ministry_type = 'network_wide';

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
  notification_title text;
  notification_url text;
  camp_resource_app_keys text[];
begin
  -- Scheduled / DEVO posts notify when they actually go live (edge cron or client).
  if new.goes_live_at is not null then
    return new;
  end if;

  if new.camp_instance_id is not null then
    select ci.resource_app_keys
    into camp_resource_app_keys
    from public.camp_instances ci
    where ci.id = new.camp_instance_id;

    select jsonb_agg(distinct ps.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions ps
    where ps.user_id is not null
      and ps.user_id <> new.created_by
      and ps.resource_app_key = any(coalesce(camp_resource_app_keys, '{}'::text[]))
      and public.user_can_access_camp_instance(ps.user_id, new.camp_instance_id);

    notification_title := 'New Camp Feed Post';
    notification_url := '/camp';
  elsif new.ministry_type = 'network_wide' then
    select jsonb_agg(distinct ps.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions ps
    where ps.user_id is not null
      and ps.user_id <> new.created_by
      and ps.resource_app_key = new.resource_app_key;

    notification_title := 'New Post in the Network Feed';
    notification_url := '/feed?feedScope=network_wide';
  elsif new.campus_id is not null then
    select jsonb_agg(distinct ps.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions ps
    where ps.user_id is not null
      and ps.user_id <> new.created_by
      and ps.resource_app_key = new.resource_app_key
      and exists (
        select 1
        from public.user_campuses uc
        where uc.user_id = ps.user_id
          and uc.campus_id = new.campus_id
      );

    if new.ministry_type = 'campus_wide' then
      notification_title := 'New Post in the Campus Feed';
      notification_url := '/feed?feedScope=campus_wide&campus=' || new.campus_id::text;
    else
      notification_title := 'New Post in The Feed';
      notification_url := '/feed';
    end if;
  else
    select jsonb_agg(distinct ps.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions ps
    where ps.user_id is not null
      and ps.user_id <> new.created_by
      and ps.resource_app_key = new.resource_app_key;

    notification_title := 'New Post in The Feed';
    notification_url := '/feed';
  end if;

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
        'title', notification_title,
        'message', notification_message,
        'url', notification_url,
        'tag', 'feed-post-' || new.id::text,
        'userIds', recipient_user_ids,
        'contextType', 'feed-post',
        'contextId', new.id::text,
        'createdBy', new.created_by::text,
        'metadata', jsonb_build_object(
          'postId', new.id,
          'category', new.category,
          'resourceAppKey', new.resource_app_key,
          'campInstanceId', new.camp_instance_id,
          'campusId', new.campus_id
        )
      )
    );
  exception when others then
    raise warning 'notify_feed_post_insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

notify pgrst, 'reload schema';
