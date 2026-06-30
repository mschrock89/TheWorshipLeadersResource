create table if not exists public.camp_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  start_date date not null,
  end_date date not null,
  base_ministry_type text not null default 'student_camp',
  resource_app_keys text[] not null default array['students_hs', 'students_ms']::text[],
  campus_ids uuid[],
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(name) <> ''),
  check (btrim(slug) <> ''),
  check (start_date <= end_date),
  check (resource_app_keys <@ array['students_hs', 'students_ms']::text[])
);

create unique index if not exists camp_instances_slug_idx
  on public.camp_instances(slug);

create index if not exists camp_instances_status_dates_idx
  on public.camp_instances(status, start_date, end_date);

create index if not exists camp_instances_resource_app_keys_idx
  on public.camp_instances using gin(resource_app_keys);

create index if not exists camp_instances_campus_ids_idx
  on public.camp_instances using gin(campus_ids);

create table if not exists public.camp_content_sections (
  id uuid primary key default gen_random_uuid(),
  camp_instance_id uuid not null references public.camp_instances(id) on delete cascade,
  title text not null,
  body text,
  link_url text,
  audience text not null default 'everyone' check (audience in ('everyone', 'ms', 'hs', 'leaders')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(title) <> '')
);

create index if not exists camp_content_sections_camp_sort_idx
  on public.camp_content_sections(camp_instance_id, is_published, sort_order, created_at);

alter table public.events
  add column if not exists camp_instance_id uuid references public.camp_instances(id) on delete set null;

alter table public.feed_posts
  add column if not exists camp_instance_id uuid references public.camp_instances(id) on delete set null;

alter table public.chat_messages
  add column if not exists camp_instance_id uuid references public.camp_instances(id) on delete set null;

alter table public.message_read_status
  add column if not exists camp_instance_id uuid references public.camp_instances(id) on delete cascade;

alter table public.admin_pings
  add column if not exists camp_instance_id uuid references public.camp_instances(id) on delete set null;

alter table public.message_read_status
  drop constraint if exists message_read_status_user_id_campus_ministry_app_key;

alter table public.message_read_status
  add constraint message_read_status_user_campus_ministry_app_camp_key
  unique nulls not distinct (user_id, campus_id, ministry_type, resource_app_key, camp_instance_id);

create index if not exists events_camp_instance_date_idx
  on public.events(camp_instance_id, event_date)
  where camp_instance_id is not null;

create index if not exists feed_posts_camp_instance_created_at_idx
  on public.feed_posts(camp_instance_id, created_at desc)
  where camp_instance_id is not null;

create index if not exists chat_messages_camp_instance_campus_ministry_idx
  on public.chat_messages(camp_instance_id, campus_id, ministry_type, created_at)
  where camp_instance_id is not null;

create index if not exists message_read_status_camp_instance_user_idx
  on public.message_read_status(camp_instance_id, user_id, campus_id, ministry_type)
  where camp_instance_id is not null;

create index if not exists admin_pings_camp_instance_created_idx
  on public.admin_pings(camp_instance_id, created_at desc)
  where camp_instance_id is not null;

create or replace function public.user_can_access_camp_instance(
  _user_id uuid,
  _camp_instance_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.camp_instances ci
    where ci.id = _camp_instance_id
      and (
        public.has_role(_user_id, 'admin'::app_role)
        or public.has_role(_user_id, 'student_pastor'::app_role)
        or public.has_role(_user_id, 'student_worship_pastor'::app_role)
        or (
          ci.status = 'active'
          and (
            coalesce(array_length(ci.campus_ids, 1), 0) = 0
            or exists (
              select 1
              from public.user_campuses uc
              where uc.user_id = _user_id
                and uc.campus_id = any(coalesce(ci.campus_ids, '{}'::uuid[]))
            )
          )
          and (
            exists (
              select 1
              from public.user_resource_app_memberships uram
              where uram.user_id = _user_id
                and uram.app_key = any(ci.resource_app_keys)
                and (
                  uram.campus_id is null
                  or coalesce(array_length(ci.campus_ids, 1), 0) = 0
                  or uram.campus_id = any(coalesce(ci.campus_ids, '{}'::uuid[]))
                )
            )
            or exists (
              select 1
              from public.user_roles ur
              where ur.user_id = _user_id
                and (
                  ur.role = 'student'::app_role
                  or (
                    'students_ms' = any(ci.resource_app_keys)
                    and ur.role in ('ms_leader'::app_role, 'ms_leader_weekend'::app_role)
                  )
                  or (
                    'students_hs' = any(ci.resource_app_keys)
                    and ur.role = 'hs_leader'::app_role
                  )
                )
            )
            or exists (
              select 1
              from public.user_ministry_campuses umc
              where umc.user_id = _user_id
                and (
                  coalesce(array_length(ci.campus_ids, 1), 0) = 0
                  or umc.campus_id = any(coalesce(ci.campus_ids, '{}'::uuid[]))
                )
                and umc.ministry_type in ('student_camp', 'student_camp_morning', 'student_camp_evening')
            )
          )
        )
      )
  )
$$;

alter table public.camp_instances enable row level security;
alter table public.camp_content_sections enable row level security;

drop policy if exists "Camp members can view camp instances" on public.camp_instances;
create policy "Camp members can view camp instances"
on public.camp_instances
for select
using (public.user_can_access_camp_instance(auth.uid(), id));

drop policy if exists "Student admins can manage camp instances" on public.camp_instances;
create policy "Student admins can manage camp instances"
on public.camp_instances
for all
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
);

drop policy if exists "Camp members can view published camp content" on public.camp_content_sections;
create policy "Camp members can view published camp content"
on public.camp_content_sections
for select
using (
  is_published = true
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Student admins can manage camp content" on public.camp_content_sections;
create policy "Student admins can manage camp content"
on public.camp_content_sections
for all
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
);

drop policy if exists "Camp members can view camp events" on public.events;
create policy "Camp members can view camp events"
on public.events
for select
using (
  camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can view camp chat messages" on public.chat_messages;
create policy "Camp members can view camp chat messages"
on public.chat_messages
for select
using (
  camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can insert camp chat messages" on public.chat_messages;
create policy "Camp members can insert camp chat messages"
on public.chat_messages
for insert
with check (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can update own recent camp messages" on public.chat_messages;
create policy "Camp members can update own recent camp messages"
on public.chat_messages
for update
using (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
  and created_at > (now() - '00:15:00'::interval)
)
with check (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can delete own camp messages" on public.chat_messages;
create policy "Camp members can delete own camp messages"
on public.chat_messages
for delete
using (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can view own camp read status" on public.message_read_status;
create policy "Camp members can view own camp read status"
on public.message_read_status
for select
using (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can insert own camp read status" on public.message_read_status;
create policy "Camp members can insert own camp read status"
on public.message_read_status
for insert
with check (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Camp members can update own camp read status" on public.message_read_status;
create policy "Camp members can update own camp read status"
on public.message_read_status
for update
using (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
)
with check (
  auth.uid() = user_id
  and camp_instance_id is not null
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Recipients can view their admin pings" on public.admin_pings;
create policy "Recipients can view their admin pings"
on public.admin_pings
for select
using (
  exists (
    select 1
    from public.admin_ping_recipients apr
    where apr.ping_id = admin_pings.id
      and apr.user_id = auth.uid()
  )
);

drop policy if exists "Camp admins can view sent camp pings" on public.admin_pings;
create policy "Camp admins can view sent camp pings"
on public.admin_pings
for select
using (
  camp_instance_id is not null
  and (
    sent_by_user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

create or replace trigger update_camp_instances_updated_at
before update on public.camp_instances
for each row
execute function public.update_updated_at_column();

create or replace trigger update_camp_content_sections_updated_at
before update on public.camp_content_sections
for each row
execute function public.update_updated_at_column();

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
          'campInstanceId', new.camp_instance_id
        )
      )
    );
  exception when others then
    raise warning 'notify_feed_post_insert failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
