create table public.resource_apps (
  key text primary key,
  name text not null,
  short_name text not null,
  host text not null,
  path_prefix text not null default '/',
  theme_color text not null default '#000000',
  is_admin_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (key in ('my_church_resource', 'worship', 'students_hs', 'students_ms'))
);

insert into public.resource_apps (key, name, short_name, host, path_prefix, theme_color, is_admin_only)
values
  ('my_church_resource', 'My Church Resource', 'MCR', 'mychurchresource.com', '/admin', '#0f172a', true),
  ('worship', 'Worship Resource', 'Worship', 'worship.mychurchresource.com', '/', '#000000', false),
  ('students_hs', 'Experience Students HS', 'Students HS', 'students.mychurchresource.com', '/hs', '#1d4ed8', false),
  ('students_ms', 'Experience Students MS', 'Students MS', 'students.mychurchresource.com', '/ms', '#7c3aed', false)
on conflict (key) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  host = excluded.host,
  path_prefix = excluded.path_prefix,
  theme_color = excluded.theme_color,
  is_admin_only = excluded.is_admin_only,
  updated_at = now();

create table public.user_resource_app_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_key text not null references public.resource_apps(key) on delete restrict,
  campus_id uuid references public.campuses(id) on delete cascade,
  role text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(role) <> '')
);

create unique index user_resource_app_memberships_unique_idx
  on public.user_resource_app_memberships (
    user_id,
    app_key,
    coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid),
    role
  );

create index user_resource_app_memberships_user_idx
  on public.user_resource_app_memberships(user_id);

create index user_resource_app_memberships_app_campus_idx
  on public.user_resource_app_memberships(app_key, campus_id);

alter table public.resource_apps enable row level security;
alter table public.user_resource_app_memberships enable row level security;

create policy "Authenticated users can view active resource apps"
  on public.resource_apps
  for select
  using (
    auth.uid() is not null
    and (
      is_active = true
      or has_role(auth.uid(), 'admin'::app_role)
    )
  );

create policy "Admins can manage resource apps"
  on public.resource_apps
  for all
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Users can view their app memberships"
  on public.user_resource_app_memberships
  for select
  using (
    auth.uid() = user_id
    or has_role(auth.uid(), 'admin'::app_role)
    or (
      has_role(auth.uid(), 'campus_admin'::app_role)
      and campus_id is not null
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'campus_admin'::app_role
          and ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  );

create policy "Admins can manage app memberships"
  on public.user_resource_app_memberships
  for all
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or (
      has_role(auth.uid(), 'campus_admin'::app_role)
      and campus_id is not null
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'campus_admin'::app_role
          and ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  )
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or (
      has_role(auth.uid(), 'campus_admin'::app_role)
      and campus_id is not null
      and exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role = 'campus_admin'::app_role
          and ur.admin_campus_id = user_resource_app_memberships.campus_id
      )
    )
  );

create trigger update_resource_apps_updated_at
before update on public.resource_apps
for each row
execute function public.update_updated_at_column();

create trigger update_user_resource_app_memberships_updated_at
before update on public.user_resource_app_memberships
for each row
execute function public.update_updated_at_column();

alter table public.feed_posts
  add column resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index feed_posts_resource_app_created_at_idx
  on public.feed_posts(resource_app_key, created_at desc);

alter table public.worship_teams
  add column resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index worship_teams_resource_app_idx
  on public.worship_teams(resource_app_key);

alter table public.team_schedule
  add column resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index team_schedule_resource_app_date_idx
  on public.team_schedule(resource_app_key, schedule_date);

alter table public.albums
  add column resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index albums_resource_app_created_at_idx
  on public.albums(resource_app_key, created_at desc);

alter table public.push_subscriptions
  add column resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict;

create index push_subscriptions_resource_app_user_idx
  on public.push_subscriptions(resource_app_key, user_id);
