create table if not exists public.teaching_schedule_uploads (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null default 'weekend',
  file_name text not null,
  storage_path text not null,
  range_start date not null,
  range_end date not null,
  row_count integer not null default 0 check (row_count >= 0),
  is_active boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teaching_schedule_uploads_lookup_idx
  on public.teaching_schedule_uploads(campus_id, ministry_type, created_at desc);

create unique index if not exists teaching_schedule_uploads_one_active_idx
  on public.teaching_schedule_uploads(campus_id, ministry_type)
  where is_active;

create trigger trg_teaching_schedule_uploads_updated_at
before update on public.teaching_schedule_uploads
for each row
execute function public.update_updated_at_column();

alter table public.teaching_schedule_uploads enable row level security;

create policy "Authenticated users can view teaching schedule uploads"
  on public.teaching_schedule_uploads
  for select
  using (auth.uid() is not null);

create policy "Staff can manage teaching schedule uploads"
  on public.teaching_schedule_uploads
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
