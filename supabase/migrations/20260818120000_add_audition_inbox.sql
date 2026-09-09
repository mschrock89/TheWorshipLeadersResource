-- Gmail-backed audition interest inbox for leaders.
-- Separate from google_integrations so Calendar OAuth stays calendar-only.

create table if not exists public.gmail_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email_address text not null,
  refresh_token text not null,
  history_id text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_integrations enable row level security;

drop policy if exists "Users can view their own Gmail integration" on public.gmail_integrations;
create policy "Users can view their own Gmail integration"
  on public.gmail_integrations
  for select
  using (auth.uid() = user_id);

create index if not exists gmail_integrations_user_id_idx
  on public.gmail_integrations(user_id);

drop trigger if exists trg_gmail_integrations_updated_at on public.gmail_integrations;
create trigger trg_gmail_integrations_updated_at
before update on public.gmail_integrations
for each row
execute function public.update_updated_at_column();

create table if not exists public.audition_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  connected_by uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  rfc_message_id text,
  from_email text not null,
  from_name text,
  to_email text,
  subject text,
  snippet text,
  body_text text,
  received_at timestamptz not null,
  matched_keywords text[] not null default '{}',
  match_reason text,
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'replied', 'scheduled', 'dismissed')),
  candidate_user_id uuid references public.profiles(id) on delete set null,
  audition_id uuid references public.auditions(id) on delete set null,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connected_by, gmail_message_id)
);

alter table public.audition_inbox_messages enable row level security;

drop policy if exists "Owners can view their audition inbox" on public.audition_inbox_messages;
create policy "Owners can view their audition inbox"
  on public.audition_inbox_messages
  for select
  using (auth.uid() = connected_by);

drop policy if exists "Owners can update their audition inbox" on public.audition_inbox_messages;
create policy "Owners can update their audition inbox"
  on public.audition_inbox_messages
  for update
  using (auth.uid() = connected_by)
  with check (auth.uid() = connected_by);

create index if not exists audition_inbox_messages_owner_status_idx
  on public.audition_inbox_messages(connected_by, status, received_at desc);

create index if not exists audition_inbox_messages_from_email_idx
  on public.audition_inbox_messages(connected_by, from_email);

drop trigger if exists trg_audition_inbox_messages_updated_at on public.audition_inbox_messages;
create trigger trg_audition_inbox_messages_updated_at
before update on public.audition_inbox_messages
for each row
execute function public.update_updated_at_column();

create table if not exists public.audition_inbox_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.audition_inbox_messages(id) on delete cascade,
  sent_by uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text,
  body_text text not null,
  sent_at timestamptz not null default now()
);

alter table public.audition_inbox_replies enable row level security;

drop policy if exists "Owners can view their audition inbox replies" on public.audition_inbox_replies;
create policy "Owners can view their audition inbox replies"
  on public.audition_inbox_replies
  for select
  using (
    exists (
      select 1
      from public.audition_inbox_messages m
      where m.id = audition_inbox_replies.message_id
        and m.connected_by = auth.uid()
    )
  );

create index if not exists audition_inbox_replies_message_id_idx
  on public.audition_inbox_replies(message_id, sent_at desc);

create or replace function public.run_gmail_inbox_sync()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  supabase_url text;
  service_role_key text;
begin
  select decrypted_secret
    into supabase_url
  from vault.decrypted_secrets
  where name = 'supabase_url'
  limit 1;

  select decrypted_secret
    into service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  if supabase_url is null or service_role_key is null then
    raise warning 'run_gmail_inbox_sync missing vault secrets (supabase_url/service_role_key)';
    return;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/gmail-sync-inbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'run_all', true
    )
  );
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'gmail-inbox-sync'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'gmail-inbox-sync',
    '*/15 * * * *',
    $cron$select public.run_gmail_inbox_sync();$cron$
  );
end
$$;
