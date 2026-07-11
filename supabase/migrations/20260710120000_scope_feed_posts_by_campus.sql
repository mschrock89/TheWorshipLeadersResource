-- Scope The Feed by campus. Existing app-level posts become Murfreesboro Central;
-- other campuses start empty until someone posts there. Camp Mode feeds stay
-- scoped by camp_instance_id (campus_id remains null for those rows).

alter table public.feed_posts
  add column if not exists campus_id uuid references public.campuses(id) on delete set null;

-- Backfill existing main-app posts to Murfreesboro Central.
update public.feed_posts
set campus_id = 'd70b980c-27a4-43b5-800b-1c58899ece90'
where camp_instance_id is null
  and campus_id is null;

create index if not exists feed_posts_resource_app_campus_created_at_idx
  on public.feed_posts(resource_app_key, campus_id, created_at desc)
  where camp_instance_id is null;

-- Push only to users assigned to the post's campus (main Feed).
-- Camp Mode feeds keep the existing camp-member recipient filter.
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
  camp_resource_app_keys text[];
begin
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
  else
    select jsonb_agg(distinct ps.user_id::text)
    into recipient_user_ids
    from public.push_subscriptions ps
    where ps.user_id is not null
      and ps.user_id <> new.created_by
      and ps.resource_app_key = new.resource_app_key;
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
        'title', case when new.camp_instance_id is not null then 'New Camp Feed Post' else 'New Post in The Feed' end,
        'message', notification_message,
        'url', case when new.camp_instance_id is not null then '/camp' else '/feed' end,
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
