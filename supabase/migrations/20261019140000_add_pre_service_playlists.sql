-- Pre-service MP3 playlists for FOH and BCAST, saved by year and trimester.
-- Playback replaces the iPod. Files live in a public bucket so a tablet can
-- play a long playlist without a signed URL expiring mid-song.

alter table public.live_sessions
  drop constraint if exists live_sessions_listener_station_check;

alter table public.live_sessions
  add constraint live_sessions_listener_station_check
  check (listener_station is null or listener_station in ('foh', 'mon', 'bcast'));

create table if not exists public.pre_service_playlists (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  station text not null check (station in ('foh', 'bcast')),
  year integer not null check (year between 2000 and 2100),
  trimester integer not null check (trimester between 1 and 3),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, station, year, trimester)
);

create index if not exists pre_service_playlists_campus_idx
  on public.pre_service_playlists (campus_id, station, year, trimester);

create trigger trg_pre_service_playlists_updated_at
before update on public.pre_service_playlists
for each row
execute function public.update_updated_at_column();

create table if not exists public.pre_service_playlist_tracks (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.pre_service_playlists(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  storage_path text not null,
  duration_ms integer not null check (duration_ms > 0 and duration_ms < 36000000),
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create index if not exists pre_service_playlist_tracks_order_idx
  on public.pre_service_playlist_tracks (playlist_id, sort_order);

alter table public.pre_service_playlists enable row level security;
alter table public.pre_service_playlist_tracks enable row level security;

create policy "Production can view pre-service playlists"
  on public.pre_service_playlists
  for select
  using (public.user_can_access_production_live(auth.uid(), campus_id));

create policy "Production can create pre-service playlists"
  on public.pre_service_playlists
  for insert
  with check (
    auth.uid() = created_by
    and public.user_can_access_production_live(auth.uid(), campus_id)
  );

create policy "Production can update pre-service playlists"
  on public.pre_service_playlists
  for update
  using (public.user_can_access_production_live(auth.uid(), campus_id))
  with check (public.user_can_access_production_live(auth.uid(), campus_id));

create policy "Production can delete pre-service playlists"
  on public.pre_service_playlists
  for delete
  using (public.user_can_access_production_live(auth.uid(), campus_id));

create policy "Production can view pre-service tracks"
  on public.pre_service_playlist_tracks
  for select
  using (
    exists (
      select 1
      from public.pre_service_playlists playlist
      where playlist.id = playlist_id
        and public.user_can_access_production_live(auth.uid(), playlist.campus_id)
    )
  );

create policy "Production can add pre-service tracks"
  on public.pre_service_playlist_tracks
  for insert
  with check (
    exists (
      select 1
      from public.pre_service_playlists playlist
      where playlist.id = playlist_id
        and public.user_can_access_production_live(auth.uid(), playlist.campus_id)
    )
  );

create policy "Production can update pre-service tracks"
  on public.pre_service_playlist_tracks
  for update
  using (
    exists (
      select 1
      from public.pre_service_playlists playlist
      where playlist.id = playlist_id
        and public.user_can_access_production_live(auth.uid(), playlist.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.pre_service_playlists playlist
      where playlist.id = playlist_id
        and public.user_can_access_production_live(auth.uid(), playlist.campus_id)
    )
  );

create policy "Production can delete pre-service tracks"
  on public.pre_service_playlist_tracks
  for delete
  using (
    exists (
      select 1
      from public.pre_service_playlists playlist
      where playlist.id = playlist_id
        and public.user_can_access_production_live(auth.uid(), playlist.campus_id)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('pre-service-audio', 'pre-service-audio', true, 83886080)
on conflict (id) do update
set public = true,
    file_size_limit = 83886080;

create policy "Production can upload pre-service audio"
  on storage.objects
  for insert
  with check (
    bucket_id = 'pre-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Production can update pre-service audio"
  on storage.objects
  for update
  using (
    bucket_id = 'pre-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Production can delete pre-service audio"
  on storage.objects
  for delete
  using (
    bucket_id = 'pre-service-audio'
    and public.user_can_access_production_live(
      auth.uid(),
      nullif((storage.foldername(name))[1], '')::uuid
    )
  );

create policy "Anyone can read pre-service audio"
  on storage.objects
  for select
  using (bucket_id = 'pre-service-audio');
