create table if not exists public.weekend_rundowns (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  weekend_date date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  overall_status text not null check (
    overall_status in ('no_issues', 'minor_issues', 'no_distractions', 'dumpster_fire')
  ),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekend_rundowns_user_campus_weekend_key unique (user_id, campus_id, weekend_date)
);

create index if not exists weekend_rundowns_campus_weekend_idx
  on public.weekend_rundowns(campus_id, weekend_date desc);

create trigger trg_weekend_rundowns_updated_at
before update on public.weekend_rundowns
for each row
execute function public.update_updated_at_column();

create table if not exists public.weekend_rundown_song_feedback (
  id uuid primary key default gen_random_uuid(),
  rundown_id uuid not null references public.weekend_rundowns(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekend_rundown_song_feedback_rundown_song_key unique (rundown_id, song_id)
);

create index if not exists weekend_rundown_song_feedback_song_idx
  on public.weekend_rundown_song_feedback(song_id);

create trigger trg_weekend_rundown_song_feedback_updated_at
before update on public.weekend_rundown_song_feedback
for each row
execute function public.update_updated_at_column();

create table if not exists public.weekend_rundown_vocal_feedback (
  id uuid primary key default gen_random_uuid(),
  rundown_id uuid not null references public.weekend_rundowns(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  vocalist_id uuid not null references public.profiles(id) on delete cascade,
  fit_label text null check (fit_label in ('good_fit')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekend_rundown_vocal_feedback_unique unique (rundown_id, song_id, vocalist_id)
);

create index if not exists weekend_rundown_vocal_feedback_lookup_idx
  on public.weekend_rundown_vocal_feedback(song_id, vocalist_id);

create trigger trg_weekend_rundown_vocal_feedback_updated_at
before update on public.weekend_rundown_vocal_feedback
for each row
execute function public.update_updated_at_column();

alter table public.weekend_rundowns enable row level security;
alter table public.weekend_rundown_song_feedback enable row level security;
alter table public.weekend_rundown_vocal_feedback enable row level security;

create policy "Eligible leaders can view weekend rundowns"
on public.weekend_rundowns
for select
using (
  has_role(auth.uid(), 'admin'::app_role)
  or has_role(auth.uid(), 'network_worship_pastor'::app_role)
  or has_role(auth.uid(), 'network_worship_leader'::app_role)
  or (
    (
      has_role(auth.uid(), 'campus_admin'::app_role)
      or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      or has_role(auth.uid(), 'student_worship_pastor'::app_role)
      or has_role(auth.uid(), 'video_director'::app_role)
      or has_role(auth.uid(), 'production_manager'::app_role)
    )
    and (
      campus_id in (
        select uc.campus_id
        from public.user_campuses uc
        where uc.user_id = auth.uid()
      )
      or exists (
        select 1
        from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.admin_campus_id = weekend_rundowns.campus_id
          and ur.role in ('campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
      )
    )
  )
);

create policy "Eligible leaders can create their weekend rundowns"
on public.weekend_rundowns
for insert
with check (
  user_id = auth.uid()
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'network_worship_leader'::app_role)
    or (
      (
        has_role(auth.uid(), 'campus_admin'::app_role)
        or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
        or has_role(auth.uid(), 'student_worship_pastor'::app_role)
        or has_role(auth.uid(), 'video_director'::app_role)
        or has_role(auth.uid(), 'production_manager'::app_role)
      )
      and (
        campus_id in (
          select uc.campus_id
          from public.user_campuses uc
          where uc.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.admin_campus_id = weekend_rundowns.campus_id
            and ur.role in ('campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
        )
      )
    )
  )
);

create policy "Authors can update their weekend rundowns"
on public.weekend_rundowns
for update
using (
  user_id = auth.uid()
  or has_role(auth.uid(), 'admin'::app_role)
)
with check (
  user_id = auth.uid()
  or has_role(auth.uid(), 'admin'::app_role)
);

create policy "Authors can delete their weekend rundowns"
on public.weekend_rundowns
for delete
using (
  user_id = auth.uid()
  or has_role(auth.uid(), 'admin'::app_role)
);

create policy "Eligible leaders can view weekend rundown song feedback"
on public.weekend_rundown_song_feedback
for select
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_song_feedback.rundown_id
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'network_worship_pastor'::app_role)
        or has_role(auth.uid(), 'network_worship_leader'::app_role)
        or (
          (
            has_role(auth.uid(), 'campus_admin'::app_role)
            or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
            or has_role(auth.uid(), 'student_worship_pastor'::app_role)
            or has_role(auth.uid(), 'video_director'::app_role)
            or has_role(auth.uid(), 'production_manager'::app_role)
          )
          and (
            wr.campus_id in (
              select uc.campus_id
              from public.user_campuses uc
              where uc.user_id = auth.uid()
            )
            or exists (
              select 1
              from public.user_roles ur
              where ur.user_id = auth.uid()
                and ur.admin_campus_id = wr.campus_id
                and ur.role in ('campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
            )
          )
        )
      )
  )
);

create policy "Authors can manage weekend rundown song feedback"
on public.weekend_rundown_song_feedback
for all
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_song_feedback.rundown_id
      and (wr.user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
  )
)
with check (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_song_feedback.rundown_id
      and (wr.user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
  )
);

create policy "Eligible leaders can view weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback
for select
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_vocal_feedback.rundown_id
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'network_worship_pastor'::app_role)
        or has_role(auth.uid(), 'network_worship_leader'::app_role)
        or (
          (
            has_role(auth.uid(), 'campus_admin'::app_role)
            or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
            or has_role(auth.uid(), 'student_worship_pastor'::app_role)
            or has_role(auth.uid(), 'video_director'::app_role)
            or has_role(auth.uid(), 'production_manager'::app_role)
          )
          and (
            wr.campus_id in (
              select uc.campus_id
              from public.user_campuses uc
              where uc.user_id = auth.uid()
            )
            or exists (
              select 1
              from public.user_roles ur
              where ur.user_id = auth.uid()
                and ur.admin_campus_id = wr.campus_id
                and ur.role in ('campus_admin', 'campus_worship_pastor', 'student_worship_pastor')
            )
          )
        )
      )
  )
);

create policy "Authors can manage weekend rundown vocal feedback"
on public.weekend_rundown_vocal_feedback
for all
using (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_vocal_feedback.rundown_id
      and (wr.user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
  )
)
with check (
  exists (
    select 1
    from public.weekend_rundowns wr
    where wr.id = weekend_rundown_vocal_feedback.rundown_id
      and (wr.user_id = auth.uid() or has_role(auth.uid(), 'admin'::app_role))
  )
);
