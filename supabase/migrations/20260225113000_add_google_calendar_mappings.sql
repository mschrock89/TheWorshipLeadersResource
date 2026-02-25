-- Track per-user Google Calendar event ids for synced app records.
create table if not exists public.google_calendar_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('event', 'setlist')),
  source_id uuid not null,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_type, source_id)
);

alter table public.google_calendar_mappings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'google_calendar_mappings'
      and policyname = 'Users can view their own Google calendar mappings'
  ) then
    create policy "Users can view their own Google calendar mappings"
      on public.google_calendar_mappings
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists google_calendar_mappings_user_id_idx
  on public.google_calendar_mappings(user_id);

drop trigger if exists trg_google_calendar_mappings_updated_at on public.google_calendar_mappings;
create trigger trg_google_calendar_mappings_updated_at
before update on public.google_calendar_mappings
for each row
execute function public.update_updated_at_column();
