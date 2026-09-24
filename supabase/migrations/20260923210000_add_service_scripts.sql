-- Monthly announcements and closing-prayer scripts, with an optional
-- Saturday-keyed override when a single weekend needs different wording.

create table if not exists public.service_scripts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null default 'speaker',
  resource_app_key text not null default 'worship' references public.resource_apps(key) on delete restrict,
  script_kind text not null check (script_kind in ('announcement', 'closing_prayer')),
  month_start date not null,
  weekend_date date,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_scripts_month_start_is_first check (extract(day from month_start) = 1),
  constraint service_scripts_weekend_is_saturday check (
    weekend_date is null or extract(dow from weekend_date) = 6
  ),
  constraint service_scripts_weekend_in_month check (
    weekend_date is null
    or (
      weekend_date >= month_start
      and weekend_date < (month_start + interval '1 month')::date
    )
  )
);

create unique index if not exists service_scripts_monthly_key
  on public.service_scripts (resource_app_key, campus_id, ministry_type, script_kind, month_start)
  where weekend_date is null;

create unique index if not exists service_scripts_weekly_key
  on public.service_scripts (resource_app_key, campus_id, ministry_type, script_kind, weekend_date)
  where weekend_date is not null;

create index if not exists service_scripts_lookup_idx
  on public.service_scripts (resource_app_key, campus_id, ministry_type, month_start);

create trigger trg_service_scripts_updated_at
before update on public.service_scripts
for each row
execute function public.update_updated_at_column();

alter table public.service_scripts enable row level security;

create policy "Staff can manage service scripts"
  on public.service_scripts
  for all
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'network_worship_leader'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
    or has_role(auth.uid(), 'network_student_pastor'::app_role)
    or has_role(auth.uid(), 'childrens_pastor'::app_role)
  )
  with check (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'network_worship_leader'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
    or has_role(auth.uid(), 'network_student_pastor'::app_role)
    or has_role(auth.uid(), 'childrens_pastor'::app_role)
  );

create policy "Authenticated users can view sent service scripts"
  on public.service_scripts
  for select
  using (auth.uid() is not null and status = 'sent');
