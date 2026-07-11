-- Store the speaking teacher on each teaching week (from Google Sheet / schedule sync)
alter table public.teaching_weeks
  add column if not exists teacher_name text;

comment on column public.teaching_weeks.teacher_name is
  'Name of the teacher/speaker for this weekend, synced from the teaching schedule Google Sheet.';

-- Persist the Google Sheet used as the teaching schedule source of truth
create table if not exists public.teaching_schedule_sheet_sources (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null default 'weekend',
  google_sheet_id text not null,
  google_sheet_url text not null,
  sheet_tab text,
  sheet_range text not null default 'A:Z',
  last_synced_at timestamptz,
  last_synced_by uuid references public.profiles(id) on delete set null,
  last_sync_row_count integer not null default 0 check (last_sync_row_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, ministry_type)
);

create index if not exists teaching_schedule_sheet_sources_lookup_idx
  on public.teaching_schedule_sheet_sources(campus_id, ministry_type);

drop trigger if exists trg_teaching_schedule_sheet_sources_updated_at on public.teaching_schedule_sheet_sources;
create trigger trg_teaching_schedule_sheet_sources_updated_at
before update on public.teaching_schedule_sheet_sources
for each row
execute function public.update_updated_at_column();

alter table public.teaching_schedule_sheet_sources enable row level security;

create policy "Authenticated users can view teaching schedule sheet sources"
  on public.teaching_schedule_sheet_sources
  for select
  using (auth.uid() is not null);

create policy "Staff can manage teaching schedule sheet sources"
  on public.teaching_schedule_sheet_sources
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
