alter table public.events
  add column if not exists campus_ids uuid[],
  add column if not exists ministry_types text[];

update public.events
set campus_ids = case
  when campus_id is not null then array[campus_id]
  else null
end
where campus_ids is null;

update public.events
set ministry_types = case
  when ministry_type is not null then array[ministry_type]
  else null
end
where ministry_types is null;

drop policy if exists "Users can view scoped events" on public.events;

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
      (
        coalesce(array_length(public.events.campus_ids, 1), 0) = 0
        and public.events.campus_id is null
      )
      or exists (
        select 1
        from public.user_campuses uc
        where uc.user_id = auth.uid()
          and (
            uc.campus_id = public.events.campus_id
            or uc.campus_id = any(coalesce(public.events.campus_ids, '{}'::uuid[]))
          )
      )
    )
    and (
      (
        coalesce(array_length(public.events.ministry_types, 1), 0) = 0
        and public.events.ministry_type is null
      )
      or exists (
        select 1
        from public.user_ministry_campuses umc
        where umc.user_id = auth.uid()
          and (
            public.events.campus_id is null
            or umc.campus_id = public.events.campus_id
            or umc.campus_id = any(coalesce(public.events.campus_ids, '{}'::uuid[]))
          )
          and (
            umc.ministry_type = public.events.ministry_type
            or umc.ministry_type = any(coalesce(public.events.ministry_types, '{}'::text[]))
            or (
              (
                public.events.ministry_type in ('weekend', 'weekend_team', 'sunday_am')
                or coalesce(public.events.ministry_types, '{}'::text[]) && array['weekend', 'weekend_team', 'sunday_am']::text[]
              )
              and umc.ministry_type in ('weekend', 'weekend_team', 'sunday_am')
            )
          )
      )
    )
  )
);
