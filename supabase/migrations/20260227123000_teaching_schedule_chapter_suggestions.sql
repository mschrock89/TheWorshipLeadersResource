-- Phase 1: Teaching Schedule + Themes + Embedding infrastructure

create extension if not exists vector;

-- Teaching series (high-level grouping)
create table if not exists public.teaching_series (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  ministry_type text not null default 'weekend',
  title text not null,
  description text,
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teaching_series_campus_idx
  on public.teaching_series(campus_id, ministry_type);

-- Teaching weeks (book/chapter/date + hybrid themes + embedding)
create table if not exists public.teaching_weeks (
  id uuid primary key default gen_random_uuid(),
  teaching_series_id uuid references public.teaching_series(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null default 'weekend',
  weekend_date date not null,
  book text not null,
  chapter integer not null check (chapter > 0),
  translation text not null default 'NIV',
  themes_manual text[] not null default '{}',
  themes_suggested text[] not null default '{}',
  ai_summary text,
  chapter_reference text,
  chapter_text text,
  embedding vector(1536),
  analyzed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campus_id, ministry_type, weekend_date, book, chapter)
);

create index if not exists teaching_weeks_lookup_idx
  on public.teaching_weeks(campus_id, ministry_type, weekend_date);

create index if not exists teaching_weeks_embedding_idx
  on public.teaching_weeks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Attach teaching week to calendar events
alter table public.events
  add column if not exists teaching_week_id uuid references public.teaching_weeks(id) on delete set null;

create index if not exists events_teaching_week_idx
  on public.events(teaching_week_id);

-- Song metadata enrichments
alter table public.songs
  add column if not exists is_active boolean not null default true,
  add column if not exists is_regular_rotation boolean not null default false,
  add column if not exists is_deep_cut boolean not null default false,
  add column if not exists is_new_song boolean not null default false,
  add column if not exists last_used_date date;

-- Song versions with embeddings/chord sheets
create table if not exists public.song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  version_name text not null default 'Default',
  lyrics text,
  chord_chart_text text,
  chord_sheet_file_path text,
  is_primary boolean not null default true,
  embedding vector(1536),
  embedding_generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(song_id, version_name)
);

create index if not exists song_versions_song_id_idx
  on public.song_versions(song_id);

create index if not exists song_versions_embedding_idx
  on public.song_versions
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Similarity search RPC (cosine distance)
create or replace function public.match_song_versions(
  query_embedding vector(1536),
  match_count integer default 50
)
returns table (
  song_version_id uuid,
  song_id uuid,
  similarity double precision,
  distance double precision
)
language sql
stable
as $$
  select
    sv.id as song_version_id,
    sv.song_id,
    1 - (sv.embedding <=> query_embedding) as similarity,
    (sv.embedding <=> query_embedding) as distance
  from public.song_versions sv
  where sv.embedding is not null
  order by sv.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Storage bucket for chord sheets
insert into storage.buckets (id, name, public)
values ('chord_sheets', 'chord_sheets', false)
on conflict (id) do nothing;

-- Ensure update timestamp trigger exists on new tables
create trigger trg_teaching_series_updated_at
before update on public.teaching_series
for each row
execute function public.update_updated_at_column();

create trigger trg_teaching_weeks_updated_at
before update on public.teaching_weeks
for each row
execute function public.update_updated_at_column();

create trigger trg_song_versions_updated_at
before update on public.song_versions
for each row
execute function public.update_updated_at_column();

-- RLS
alter table public.teaching_series enable row level security;
alter table public.teaching_weeks enable row level security;
alter table public.song_versions enable row level security;

-- Read access for authenticated users
create policy "Authenticated users can view teaching series"
  on public.teaching_series
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can view teaching weeks"
  on public.teaching_weeks
  for select
  using (auth.uid() is not null);

create policy "Authenticated users can view song versions"
  on public.song_versions
  for select
  using (auth.uid() is not null);

-- Staff write access
create policy "Staff can manage teaching series"
  on public.teaching_series
  for all
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  );

create policy "Staff can manage teaching weeks"
  on public.teaching_weeks
  for all
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  );

create policy "Staff can manage song versions"
  on public.song_versions
  for all
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  );

-- Storage policies for chord_sheets
create policy "Authenticated users can read chord sheets"
on storage.objects
for select
to authenticated
using (bucket_id = 'chord_sheets');

create policy "Staff can upload chord sheets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chord_sheets'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);

create policy "Staff can update chord sheets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chord_sheets'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
)
with check (
  bucket_id = 'chord_sheets'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);

create policy "Staff can delete chord sheets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chord_sheets'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);
