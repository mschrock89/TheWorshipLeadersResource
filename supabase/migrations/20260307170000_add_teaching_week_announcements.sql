create table if not exists public.teaching_week_announcements (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null default 'weekend',
  weekend_date date not null,
  psa_highlight text,
  announcer_name text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, ministry_type, weekend_date)
);

create index if not exists teaching_week_announcements_lookup_idx
  on public.teaching_week_announcements(campus_id, ministry_type, weekend_date);

create trigger trg_teaching_week_announcements_updated_at
before update on public.teaching_week_announcements
for each row
execute function public.update_updated_at_column();

alter table public.teaching_week_announcements enable row level security;

create policy "Authenticated users can view teaching week announcements"
  on public.teaching_week_announcements
  for select
  using (auth.uid() is not null);

create policy "Staff can manage teaching week announcements"
  on public.teaching_week_announcements
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
