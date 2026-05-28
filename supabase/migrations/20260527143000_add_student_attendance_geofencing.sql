alter table public.campuses
add column if not exists attendance_enabled boolean not null default false,
add column if not exists geofence_latitude double precision,
add column if not exists geofence_longitude double precision,
add column if not exists geofence_radius_meters integer not null default 150;

alter table public.campuses
drop constraint if exists campuses_geofence_radius_meters_check;

alter table public.campuses
add constraint campuses_geofence_radius_meters_check
check (geofence_radius_meters between 25 and 5000);

create table if not exists public.student_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  resource_app_key text not null default 'worship',
  check_in_method text not null default 'geolocation',
  checked_in_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  checked_out_at timestamptz,
  distance_meters numeric,
  location_accuracy_meters numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_attendance_sessions_campus_active_idx
on public.student_attendance_sessions (campus_id, last_seen_at desc)
where checked_out_at is null;

create index if not exists student_attendance_sessions_user_active_idx
on public.student_attendance_sessions (user_id, campus_id)
where checked_out_at is null;

create index if not exists student_attendance_sessions_checked_in_idx
on public.student_attendance_sessions (checked_in_at desc);

create unique index if not exists student_attendance_one_active_per_user_campus_idx
on public.student_attendance_sessions (user_id, campus_id)
where checked_out_at is null;

alter table public.student_attendance_sessions enable row level security;

create or replace function public.can_manage_attendance(_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and (
        ur.role in ('admin', 'network_worship_pastor', 'network_worship_leader', 'student_pastor')
        or (
          ur.role in ('campus_admin', 'campus_worship_pastor', 'student_worship_pastor', 'childrens_pastor')
          and (
            ur.admin_campus_id = _campus_id
            or exists (
              select 1
              from public.user_campuses uc
              where uc.user_id = auth.uid()
                and uc.campus_id = _campus_id
            )
          )
        )
      )
  );
$$;

create or replace function public.record_student_attendance(
  _campus_id uuid,
  _distance_meters numeric,
  _location_accuracy_meters numeric,
  _resource_app_key text default 'worship'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  session_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.campuses c
    where c.id = _campus_id
      and c.attendance_enabled = true
      and c.geofence_latitude is not null
      and c.geofence_longitude is not null
  ) then
    raise exception 'Attendance is not enabled for this campus';
  end if;

  insert into public.student_attendance_sessions (
    user_id,
    campus_id,
    resource_app_key,
    check_in_method,
    distance_meters,
    location_accuracy_meters,
    last_seen_at,
    updated_at
  )
  values (
    auth.uid(),
    _campus_id,
    coalesce(nullif(_resource_app_key, ''), 'worship'),
    'geolocation',
    _distance_meters,
    _location_accuracy_meters,
    now(),
    now()
  )
  on conflict (user_id, campus_id) where checked_out_at is null
  do update set
    last_seen_at = now(),
    updated_at = now(),
    distance_meters = excluded.distance_meters,
    location_accuracy_meters = excluded.location_accuracy_meters,
    resource_app_key = excluded.resource_app_key
  returning id into session_id;

  return session_id;
end;
$$;

create or replace function public.mark_student_attendance_departed(_campus_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.student_attendance_sessions
  set checked_out_at = now(),
      updated_at = now()
  where user_id = auth.uid()
    and campus_id = _campus_id
    and checked_out_at is null;
end;
$$;

create or replace function public.update_attendance_campus_settings(
  _campus_id uuid,
  _attendance_enabled boolean,
  _geofence_latitude double precision,
  _geofence_longitude double precision,
  _geofence_radius_meters integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_attendance(_campus_id) then
    raise exception 'Not authorized to manage attendance for this campus';
  end if;

  update public.campuses
  set attendance_enabled = _attendance_enabled,
      geofence_latitude = _geofence_latitude,
      geofence_longitude = _geofence_longitude,
      geofence_radius_meters = coalesce(_geofence_radius_meters, 150)
  where id = _campus_id;
end;
$$;

drop policy if exists "Users can view their own attendance sessions" on public.student_attendance_sessions;
create policy "Users can view their own attendance sessions"
on public.student_attendance_sessions
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Attendance managers can view campus sessions" on public.student_attendance_sessions;
create policy "Attendance managers can view campus sessions"
on public.student_attendance_sessions
for select
to authenticated
using (public.can_manage_attendance(campus_id));

drop policy if exists "Users can create their own attendance sessions" on public.student_attendance_sessions;
drop policy if exists "Users can update their own attendance sessions" on public.student_attendance_sessions;

-- Writes go through security-definer RPCs so clients cannot spoof direct check-ins.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'student_attendance_sessions'
  ) then
    alter publication supabase_realtime add table public.student_attendance_sessions;
  end if;
end $$;
