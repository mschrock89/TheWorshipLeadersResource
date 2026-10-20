-- One long-lived end-of-service prayer track per campus and LIVE output.

create table if not exists public.end_service_ambient_tracks (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  station text not null check (station in ('foh', 'bcast')),
  title text not null check (char_length(title) between 1 and 200),
  storage_path text not null,
  duration_ms integer not null check (duration_ms > 0 and duration_ms < 36000000),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, station)
);

create index if not exists end_service_ambient_tracks_campus_idx
  on public.end_service_ambient_tracks (campus_id, station);

create trigger trg_end_service_ambient_tracks_updated_at
before update on public.end_service_ambient_tracks
for each row
execute function public.update_updated_at_column();

alter table public.end_service_ambient_tracks enable row level security;

create policy "Production can view end-service ambient tracks"
  on public.end_service_ambient_tracks
  for select
  using (public.user_can_access_production_live(auth.uid(), campus_id));

create policy "Production can create end-service ambient tracks"
  on public.end_service_ambient_tracks
  for insert
  with check (
    auth.uid() = created_by
    and public.user_can_access_production_live(auth.uid(), campus_id)
  );

create policy "Production can update end-service ambient tracks"
  on public.end_service_ambient_tracks
  for update
  using (public.user_can_access_production_live(auth.uid(), campus_id))
  with check (
    auth.uid() = created_by
    and public.user_can_access_production_live(auth.uid(), campus_id)
  );

create policy "Production can delete end-service ambient tracks"
  on public.end_service_ambient_tracks
  for delete
  using (public.user_can_access_production_live(auth.uid(), campus_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('end-service-audio', 'end-service-audio', true, 83886080)
on conflict (id) do update
set public = true,
    file_size_limit = 83886080;

create policy "Production can upload end-service audio"
  on storage.objects
  for insert
  with check (
    bucket_id = 'end-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Production can update end-service audio"
  on storage.objects
  for update
  using (
    bucket_id = 'end-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Production can delete end-service audio"
  on storage.objects
  for delete
  using (
    bucket_id = 'end-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Anyone can read end-service audio"
  on storage.objects
  for select
  using (bucket_id = 'end-service-audio');
