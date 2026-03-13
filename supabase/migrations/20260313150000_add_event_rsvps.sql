create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'coming' check (status in ('coming')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_rsvps_event_idx
  on public.event_rsvps(event_id, created_at asc);

create trigger trg_event_rsvps_updated_at
before update on public.event_rsvps
for each row
execute function public.update_updated_at_column();

alter table public.event_rsvps enable row level security;

create policy "Authenticated users can view event rsvps"
  on public.event_rsvps
  for select
  using (auth.uid() is not null);

create policy "Users can manage their own event rsvps"
  on public.event_rsvps
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.event_rsvps;
