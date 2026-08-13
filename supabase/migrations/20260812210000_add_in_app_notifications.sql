-- Persist an in-app inbox row for every push recipient so the notification
-- center can keep unread items until they are marked read (not just 7 days).

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  link text,
  notification_type text not null default 'push',
  context_type text,
  context_id text,
  tag text,
  resource_app_key text,
  camp_instance_id uuid,
  push_notification_log_id uuid references public.push_notification_logs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint in_app_notifications_user_dedupe_key unique (user_id, dedupe_key)
);

alter table public.in_app_notifications enable row level security;

create index if not exists idx_in_app_notifications_user_created
  on public.in_app_notifications (user_id, created_at desc);

create index if not exists idx_in_app_notifications_user_unread
  on public.in_app_notifications (user_id, created_at desc)
  where read_at is null;

drop policy if exists "Users can view their own in-app notifications"
  on public.in_app_notifications;

create policy "Users can view their own in-app notifications"
on public.in_app_notifications
for select
using (auth.uid() = user_id);

drop policy if exists "Users can mark their in-app notifications read"
  on public.in_app_notifications;

create policy "Users can mark their in-app notifications read"
on public.in_app_notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'in_app_notifications'
  ) then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
end
$$;
