create table if not exists public.admin_pings (
  id uuid primary key default gen_random_uuid(),
  resource_app_key text not null references public.resource_apps(key) on delete restrict,
  campus_id uuid references public.campuses(id) on delete set null,
  sent_by_user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  filters jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0,
  push_sent_count integer not null default 0,
  push_failed_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_ping_recipients (
  id uuid primary key default gen_random_uuid(),
  ping_id uuid not null references public.admin_pings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ping_id, user_id)
);

alter table public.admin_pings enable row level security;
alter table public.admin_ping_recipients enable row level security;

create index if not exists idx_admin_pings_resource_created
  on public.admin_pings (resource_app_key, created_at desc);

create index if not exists idx_admin_ping_recipients_user_created
  on public.admin_ping_recipients (user_id, created_at desc);

create index if not exists idx_admin_ping_recipients_ping
  on public.admin_ping_recipients (ping_id);

drop policy if exists "Admins can view sent admin pings" on public.admin_pings;
create policy "Admins can view sent admin pings"
on public.admin_pings
for select
using (
  sent_by_user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin'::app_role)
  or public.is_student_resource_app_admin(auth.uid(), resource_app_key)
);

drop policy if exists "Users can view their admin ping recipients" on public.admin_ping_recipients;
create policy "Users can view their admin ping recipients"
on public.admin_ping_recipients
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.admin_pings ap
    where ap.id = admin_ping_recipients.ping_id
      and (
        ap.sent_by_user_id = auth.uid()
        or public.has_role(auth.uid(), 'admin'::app_role)
        or public.is_student_resource_app_admin(auth.uid(), ap.resource_app_key)
      )
  )
);

drop policy if exists "Users can mark their admin pings read" on public.admin_ping_recipients;
create policy "Users can mark their admin pings read"
on public.admin_ping_recipients
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());
