drop policy if exists "Eligible leaders can view weekend rundowns"
on public.weekend_rundowns;

drop policy if exists "Eligible leaders can create their weekend rundowns"
on public.weekend_rundowns;

drop policy if exists "Authors can update their weekend rundowns"
on public.weekend_rundowns;

drop policy if exists "Authors can delete their weekend rundowns"
on public.weekend_rundowns;

drop policy if exists "Eligible leaders can view weekend rundown song feedback"
on public.weekend_rundown_song_feedback;

drop policy if exists "Authors can manage weekend rundown song feedback"
on public.weekend_rundown_song_feedback;

drop policy if exists "Eligible leaders can view weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback;

drop policy if exists "Authors can manage weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback;

create policy "Admins can view weekend rundowns"
on public.weekend_rundowns
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'campus_admin'::app_role)
);

create policy "Admins can create weekend rundowns"
on public.weekend_rundowns
for insert
with check (
  user_id = auth.uid()
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

create policy "Admins can update weekend rundowns"
on public.weekend_rundowns
for update
using (
  user_id = auth.uid()
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
  )
)
with check (
  user_id = auth.uid()
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

create policy "Admins can delete weekend rundowns"
on public.weekend_rundowns
for delete
using (
  user_id = auth.uid()
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
  )
);

create policy "Admins can view weekend rundown song feedback"
on public.weekend_rundown_song_feedback
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'campus_admin'::app_role)
);

create policy "Admins can manage weekend rundown song feedback"
on public.weekend_rundown_song_feedback
for all
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_song_feedback.rundown_id
      and wr.user_id = auth.uid()
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'campus_admin'::app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_song_feedback.rundown_id
      and wr.user_id = auth.uid()
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'campus_admin'::app_role)
      )
  )
);

create policy "Admins can view weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'campus_admin'::app_role)
);

create policy "Admins can manage weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback
for all
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_vocal_feedback.rundown_id
      and wr.user_id = auth.uid()
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'campus_admin'::app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_vocal_feedback.rundown_id
      and wr.user_id = auth.uid()
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'campus_admin'::app_role)
      )
  )
);
