create table if not exists public.drum_tech_comments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drum_tech_comments_campus_id_created_at_idx
  on public.drum_tech_comments(campus_id, created_at asc);

create trigger trg_drum_tech_comments_updated_at
before update on public.drum_tech_comments
for each row
execute function public.update_updated_at_column();

alter table public.drum_tech_comments enable row level security;

create policy "Authenticated users can view drum tech comments"
  on public.drum_tech_comments
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can create drum tech comments"
  on public.drum_tech_comments
  for insert
  with check (
    auth.uid() = user_id
    and auth.uid() is not null
  );

create policy "Users can update their own drum tech comments"
  on public.drum_tech_comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own drum tech comments or admins can delete any"
  on public.drum_tech_comments
  for delete
  using (
    auth.uid() = user_id
    or has_role(auth.uid(), 'admin'::app_role)
  );

alter publication supabase_realtime add table public.drum_tech_comments;
