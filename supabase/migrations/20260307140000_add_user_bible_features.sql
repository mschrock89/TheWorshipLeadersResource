create table if not exists public.bible_passage_cache (
  id uuid primary key default gen_random_uuid(),
  lookup_key text not null,
  reference text not null,
  translation text not null,
  book text,
  chapter integer,
  verse_start integer,
  verse_end integer,
  text text not null,
  verses jsonb not null default '[]'::jsonb,
  source text not null default 'api',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lookup_key, translation)
);

create index if not exists bible_passage_cache_reference_idx
  on public.bible_passage_cache(reference, translation);

create trigger trg_bible_passage_cache_updated_at
before update on public.bible_passage_cache
for each row
execute function public.update_updated_at_column();

create table if not exists public.user_saved_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  passage_cache_id uuid not null references public.bible_passage_cache(id) on delete cascade,
  reference text not null,
  translation text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, passage_cache_id)
);

create index if not exists user_saved_passages_user_idx
  on public.user_saved_passages(user_id, created_at desc);

create trigger trg_user_saved_passages_updated_at
before update on public.user_saved_passages
for each row
execute function public.update_updated_at_column();

create table if not exists public.user_recent_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  passage_cache_id uuid not null references public.bible_passage_cache(id) on delete cascade,
  reference text not null,
  translation text not null,
  viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, passage_cache_id, translation)
);

create index if not exists user_recent_passages_user_idx
  on public.user_recent_passages(user_id, viewed_at desc);

create trigger trg_user_recent_passages_updated_at
before update on public.user_recent_passages
for each row
execute function public.update_updated_at_column();

alter table public.bible_passage_cache enable row level security;
alter table public.user_saved_passages enable row level security;
alter table public.user_recent_passages enable row level security;

create policy "Authenticated users can view bible passage cache"
  on public.bible_passage_cache
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can insert bible passage cache"
  on public.bible_passage_cache
  for insert
  with check (auth.uid() is not null);

create policy "Authenticated users can update bible passage cache"
  on public.bible_passage_cache
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "Users can view their saved passages"
  on public.user_saved_passages
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their saved passages"
  on public.user_saved_passages
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their saved passages"
  on public.user_saved_passages
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their saved passages"
  on public.user_saved_passages
  for delete
  using (auth.uid() = user_id);

create policy "Users can view their recent passages"
  on public.user_recent_passages
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their recent passages"
  on public.user_recent_passages
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their recent passages"
  on public.user_recent_passages
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their recent passages"
  on public.user_recent_passages
  for delete
  using (auth.uid() = user_id);
