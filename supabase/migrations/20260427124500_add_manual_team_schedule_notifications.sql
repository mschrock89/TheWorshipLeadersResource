create table if not exists public.manual_team_schedule_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sent_by_user_id uuid not null,
  schedule_date date not null,
  campus_id uuid,
  team_id uuid,
  ministry_type text not null,
  title text not null,
  message text not null,
  link text,
  created_at timestamptz not null default now()
);

alter table public.manual_team_schedule_notifications enable row level security;

create index if not exists idx_manual_team_schedule_notifications_user_created
  on public.manual_team_schedule_notifications (user_id, created_at desc);

create index if not exists idx_manual_team_schedule_notifications_schedule
  on public.manual_team_schedule_notifications (schedule_date, campus_id, ministry_type);

drop policy if exists "Users can view their own manual team schedule notifications"
  on public.manual_team_schedule_notifications;

create policy "Users can view their own manual team schedule notifications"
on public.manual_team_schedule_notifications
for select
using (auth.uid() = user_id);
