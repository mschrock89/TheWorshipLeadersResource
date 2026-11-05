-- Per-campus leadership notification choices.
-- No row means the channel stays on, unless the person is explicit-only.
-- Explicit-only people receive a channel only where it is checked.

create table public.user_admin_push_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  explicit_only boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.user_admin_push_prefs (
  user_id uuid not null references auth.users(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  channel text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, campus_id, channel)
);

create index user_admin_push_prefs_user_id_idx
  on public.user_admin_push_prefs (user_id);

alter table public.user_admin_push_settings enable row level security;
alter table public.user_admin_push_prefs enable row level security;

grant select, insert, update, delete on public.user_admin_push_settings to authenticated;
grant select, insert, update, delete on public.user_admin_push_prefs to authenticated;
grant select, insert, update, delete on public.user_admin_push_settings to service_role;
grant select, insert, update, delete on public.user_admin_push_prefs to service_role;

create policy "Users and team managers can read admin push settings"
  on public.user_admin_push_settings
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can insert admin push settings"
  on public.user_admin_push_settings
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can update admin push settings"
  on public.user_admin_push_settings
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  )
  with check (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can read admin push prefs"
  on public.user_admin_push_prefs
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can insert admin push prefs"
  on public.user_admin_push_prefs
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can update admin push prefs"
  on public.user_admin_push_prefs
  for update
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  )
  with check (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

create policy "Users and team managers can delete admin push prefs"
  on public.user_admin_push_prefs
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or public.can_manage_team_directory_profile(auth.uid(), user_id)
  );

-- Kyle Elkins only hears about setlists submitted for approval and feed posts.
insert into public.user_admin_push_settings (user_id, explicit_only)
select id, true
from auth.users
where id = '22c10f05-955a-498c-b18f-2ac570868b35'
on conflict (user_id) do update set explicit_only = true, updated_at = now();

insert into public.user_admin_push_prefs (user_id, campus_id, channel, enabled)
select '22c10f05-955a-498c-b18f-2ac570868b35', campuses.id, channels.channel, true
from public.campuses
cross join (
  values ('setlist-approval'), ('feed-posts')
) as channels(channel)
where exists (
  select 1 from auth.users where id = '22c10f05-955a-498c-b18f-2ac570868b35'
)
on conflict (user_id, campus_id, channel) do update
set enabled = true, updated_at = now();

notify pgrst, 'reload schema';
