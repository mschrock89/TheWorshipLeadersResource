alter table public.song_versions
  add column if not exists pco_arrangement_id text;

create unique index if not exists song_versions_pco_arrangement_id_key
  on public.song_versions (pco_arrangement_id);
