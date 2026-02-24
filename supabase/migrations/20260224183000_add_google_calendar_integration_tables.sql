-- Google Calendar integration persistence
create table if not exists public.google_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_integrations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_integrations'
      and policyname = 'Users can view their own Google integration'
  ) then
    create policy "Users can view their own Google integration"
      on public.google_integrations
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_integrations'
      and policyname = 'Users can insert their own Google integration'
  ) then
    create policy "Users can insert their own Google integration"
      on public.google_integrations
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_integrations'
      and policyname = 'Users can update their own Google integration'
  ) then
    create policy "Users can update their own Google integration"
      on public.google_integrations
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_integrations'
      and policyname = 'Users can delete their own Google integration'
  ) then
    create policy "Users can delete their own Google integration"
      on public.google_integrations
      for delete
      using (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists google_integrations_user_id_idx
  on public.google_integrations(user_id);

drop trigger if exists trg_google_integrations_updated_at on public.google_integrations;
create trigger trg_google_integrations_updated_at
before update on public.google_integrations
for each row
execute function public.update_updated_at_column();

-- Optional event columns for calendar sync functions
alter table public.events
  add column if not exists google_event_id text,
  add column if not exists google_synced boolean not null default false;
