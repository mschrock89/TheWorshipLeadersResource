alter table public.events
  add column if not exists ministry_type text,
  add column if not exists teaching_week_id uuid references public.teaching_weeks(id) on delete set null;

update public.events
set ministry_type = coalesce(ministry_type, 'weekend')
where ministry_type is null;

alter table public.events
  alter column ministry_type set default 'weekend';

create index if not exists events_campus_ministry_idx
  on public.events(campus_id, ministry_type, event_date);

drop policy if exists "Users can view campus events" on public.events;

create policy "Users can view scoped events"
on public.events
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'campus_admin'::app_role)
  or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
  or has_role(auth.uid(), 'student_worship_pastor'::app_role)
  or (
    (
      campus_id is null
      or campus_id in (
        select uc.campus_id
        from public.user_campuses uc
        where uc.user_id = auth.uid()
      )
    )
    and (
      ministry_type is null
      or exists (
        select 1
        from public.user_ministry_campuses umc
        where umc.user_id = auth.uid()
          and (public.events.campus_id is null or umc.campus_id = public.events.campus_id)
          and (
            umc.ministry_type = public.events.ministry_type
            or (
              public.events.ministry_type in ('weekend', 'weekend_team', 'sunday_am')
              and umc.ministry_type in ('weekend', 'weekend_team', 'sunday_am')
            )
          )
      )
    )
  )
);
