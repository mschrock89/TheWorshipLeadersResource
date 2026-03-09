create table if not exists public.draft_set_song_charts (
  id uuid primary key default gen_random_uuid(),
  draft_set_song_id uuid not null references public.draft_set_songs(id) on delete cascade,
  source_song_version_id uuid null references public.song_versions(id) on delete set null,
  version_name text not null default 'Setlist Override',
  chord_chart_text text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint draft_set_song_charts_draft_set_song_id_key unique (draft_set_song_id)
);

create index if not exists draft_set_song_charts_source_song_version_idx
  on public.draft_set_song_charts(source_song_version_id);

create trigger trg_draft_set_song_charts_updated_at
before update on public.draft_set_song_charts
for each row
execute function public.update_updated_at_column();

alter table public.draft_set_song_charts enable row level security;

create policy "Users can view draft set song charts for accessible sets"
on public.draft_set_song_charts
for select
using (
  exists (
    select 1
    from public.draft_set_songs dss
    join public.draft_sets ds on ds.id = dss.draft_set_id
    where dss.id = draft_set_song_charts.draft_set_song_id
      and (
        has_role(auth.uid(), 'admin'::app_role)
        or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
        or has_role(auth.uid(), 'student_worship_pastor'::app_role)
        or has_role(auth.uid(), 'campus_admin'::app_role)
        or ds.campus_id in (
          select uc.campus_id
          from public.user_campuses uc
          where uc.user_id = auth.uid()
        )
      )
  )
);

create policy "Users can insert draft set song charts for owned sets"
on public.draft_set_song_charts
for insert
with check (
  exists (
    select 1
    from public.draft_set_songs dss
    join public.draft_sets ds on ds.id = dss.draft_set_id
    where dss.id = draft_set_song_charts.draft_set_song_id
      and (
        ds.created_by = auth.uid()
        or has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

create policy "Users can update draft set song charts for owned sets"
on public.draft_set_song_charts
for update
using (
  exists (
    select 1
    from public.draft_set_songs dss
    join public.draft_sets ds on ds.id = dss.draft_set_id
    where dss.id = draft_set_song_charts.draft_set_song_id
      and (
        ds.created_by = auth.uid()
        or has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

create policy "Users can delete draft set song charts for owned sets"
on public.draft_set_song_charts
for delete
using (
  exists (
    select 1
    from public.draft_set_songs dss
    join public.draft_sets ds on ds.id = dss.draft_set_id
    where dss.id = draft_set_song_charts.draft_set_song_id
      and (
        ds.created_by = auth.uid()
        or has_role(auth.uid(), 'admin'::app_role)
      )
  )
);
