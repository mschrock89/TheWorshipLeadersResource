create table if not exists public.push_notification_logs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  url text,
  tag text,
  context_type text,
  context_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references public.profiles(id) on delete set null,
  cancel_reason text
);

create table if not exists public.push_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  notification_log_id uuid not null references public.push_notification_logs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'failed', 'canceled')),
  delivered_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  unique (notification_log_id, user_id)
);

create index if not exists push_notification_logs_context_idx
  on public.push_notification_logs(context_type, context_id, created_at desc);

create index if not exists push_notification_recipients_user_idx
  on public.push_notification_recipients(user_id, created_at desc);

alter table public.push_notification_logs enable row level security;
alter table public.push_notification_recipients enable row level security;

create policy "Admins can manage push notification logs"
  on public.push_notification_logs
  for all
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can view push notification recipients"
  on public.push_notification_recipients
  for select
  using (has_role(auth.uid(), 'admin'::app_role));

create policy "Admins can manage push notification recipients"
  on public.push_notification_recipients
  for all
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
