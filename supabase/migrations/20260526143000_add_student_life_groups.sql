alter table public.profiles
  add column if not exists grade_level integer check (grade_level between 8 and 12);

create table if not exists public.life_groups (
  id uuid primary key default gen_random_uuid(),
  resource_app_key text not null references public.resource_apps(key) on delete restrict,
  campus_id uuid references public.campuses(id) on delete set null,
  name text not null,
  gender text not null check (gender in ('male', 'female', 'coed')),
  grade_level integer not null check (grade_level between 8 and 12),
  meeting_location text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (resource_app_key in ('students_hs', 'students_ms')),
  check (btrim(name) <> ''),
  check (btrim(meeting_location) <> '')
);

create table if not exists public.life_group_leaders (
  group_id uuid not null references public.life_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.life_group_students (
  group_id uuid not null references public.life_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.life_group_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.life_groups(id) on delete cascade,
  meeting_date date not null,
  prayer_requests text,
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, meeting_date)
);

create table if not exists public.life_group_attendance (
  report_id uuid not null references public.life_group_weekly_reports(id) on delete cascade,
  group_id uuid not null references public.life_groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'absent' check (status in ('present', 'absent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_id, student_id)
);

create table if not exists public.life_group_weekly_feedback (
  report_id uuid primary key references public.life_group_weekly_reports(id) on delete cascade,
  feedback text not null default '',
  submitted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists life_groups_resource_campus_idx
  on public.life_groups(resource_app_key, campus_id);
create index if not exists life_group_leaders_user_idx
  on public.life_group_leaders(user_id);
create index if not exists life_group_students_user_idx
  on public.life_group_students(user_id);
create index if not exists life_group_weekly_reports_group_date_idx
  on public.life_group_weekly_reports(group_id, meeting_date desc);
create index if not exists life_group_attendance_group_idx
  on public.life_group_attendance(group_id, student_id);

create or replace function public.is_life_group_admin(_user_id uuid, _resource_app_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_student_resource_app_admin(_user_id, _resource_app_key)
$$;

create or replace function public.is_life_group_leader(_user_id uuid, _group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.life_group_leaders lgl
    where lgl.user_id = _user_id
      and lgl.group_id = _group_id
  )
$$;

create or replace function public.can_access_life_group(_user_id uuid, _group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.life_groups lg
    where lg.id = _group_id
      and (
        public.is_life_group_admin(_user_id, lg.resource_app_key)
        or public.is_life_group_leader(_user_id, lg.id)
      )
  )
$$;

alter table public.life_groups enable row level security;
alter table public.life_group_leaders enable row level security;
alter table public.life_group_students enable row level security;
alter table public.life_group_weekly_reports enable row level security;
alter table public.life_group_attendance enable row level security;
alter table public.life_group_weekly_feedback enable row level security;

drop policy if exists "Admins and leaders can view life groups" on public.life_groups;
create policy "Admins and leaders can view life groups"
  on public.life_groups
  for select
  using (
    public.is_life_group_admin(auth.uid(), resource_app_key)
    or public.is_life_group_leader(auth.uid(), id)
  );

drop policy if exists "Admins can manage life groups" on public.life_groups;
create policy "Admins can manage life groups"
  on public.life_groups
  for all
  using (public.is_life_group_admin(auth.uid(), resource_app_key))
  with check (public.is_life_group_admin(auth.uid(), resource_app_key));

drop policy if exists "Admins and leaders can view life group leaders" on public.life_group_leaders;
create policy "Admins and leaders can view life group leaders"
  on public.life_group_leaders
  for select
  using (public.can_access_life_group(auth.uid(), group_id));

drop policy if exists "Admins can manage life group leaders" on public.life_group_leaders;
create policy "Admins can manage life group leaders"
  on public.life_group_leaders
  for all
  using (
    exists (
      select 1
      from public.life_groups lg
      where lg.id = life_group_leaders.group_id
        and public.is_life_group_admin(auth.uid(), lg.resource_app_key)
    )
  )
  with check (
    exists (
      select 1
      from public.life_groups lg
      where lg.id = life_group_leaders.group_id
        and public.is_life_group_admin(auth.uid(), lg.resource_app_key)
    )
  );

drop policy if exists "Admins and leaders can view life group students" on public.life_group_students;
create policy "Admins and leaders can view life group students"
  on public.life_group_students
  for select
  using (public.can_access_life_group(auth.uid(), group_id));

drop policy if exists "Admins can manage life group students" on public.life_group_students;
create policy "Admins can manage life group students"
  on public.life_group_students
  for all
  using (
    exists (
      select 1
      from public.life_groups lg
      where lg.id = life_group_students.group_id
        and public.is_life_group_admin(auth.uid(), lg.resource_app_key)
    )
  )
  with check (
    exists (
      select 1
      from public.life_groups lg
      where lg.id = life_group_students.group_id
        and public.is_life_group_admin(auth.uid(), lg.resource_app_key)
    )
  );

drop policy if exists "Admins and leaders can manage life group reports" on public.life_group_weekly_reports;
create policy "Admins and leaders can manage life group reports"
  on public.life_group_weekly_reports
  for all
  using (public.can_access_life_group(auth.uid(), group_id))
  with check (public.can_access_life_group(auth.uid(), group_id));

drop policy if exists "Admins and leaders can manage life group attendance" on public.life_group_attendance;
create policy "Admins and leaders can manage life group attendance"
  on public.life_group_attendance
  for all
  using (public.can_access_life_group(auth.uid(), group_id))
  with check (public.can_access_life_group(auth.uid(), group_id));

drop policy if exists "Admins can view life group feedback" on public.life_group_weekly_feedback;
create policy "Admins can view life group feedback"
  on public.life_group_weekly_feedback
  for select
  using (
    exists (
      select 1
      from public.life_group_weekly_reports r
      join public.life_groups lg on lg.id = r.group_id
      where r.id = life_group_weekly_feedback.report_id
        and public.is_life_group_admin(auth.uid(), lg.resource_app_key)
    )
  );

drop policy if exists "Admins and leaders can submit life group feedback" on public.life_group_weekly_feedback;
create policy "Admins and leaders can submit life group feedback"
  on public.life_group_weekly_feedback
  for insert
  with check (
    exists (
      select 1
      from public.life_group_weekly_reports r
      where r.id = life_group_weekly_feedback.report_id
        and public.can_access_life_group(auth.uid(), r.group_id)
    )
  );

drop policy if exists "Admins and leaders can update life group feedback" on public.life_group_weekly_feedback;
create policy "Admins and leaders can update life group feedback"
  on public.life_group_weekly_feedback
  for update
  using (
    exists (
      select 1
      from public.life_group_weekly_reports r
      where r.id = life_group_weekly_feedback.report_id
        and public.can_access_life_group(auth.uid(), r.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.life_group_weekly_reports r
      where r.id = life_group_weekly_feedback.report_id
        and public.can_access_life_group(auth.uid(), r.group_id)
    )
  );

drop trigger if exists update_life_groups_updated_at on public.life_groups;
create trigger update_life_groups_updated_at
before update on public.life_groups
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_life_group_weekly_reports_updated_at on public.life_group_weekly_reports;
create trigger update_life_group_weekly_reports_updated_at
before update on public.life_group_weekly_reports
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_life_group_attendance_updated_at on public.life_group_attendance;
create trigger update_life_group_attendance_updated_at
before update on public.life_group_attendance
for each row
execute function public.update_updated_at_column();

drop trigger if exists update_life_group_weekly_feedback_updated_at on public.life_group_weekly_feedback;
create trigger update_life_group_weekly_feedback_updated_at
before update on public.life_group_weekly_feedback
for each row
execute function public.update_updated_at_column();
