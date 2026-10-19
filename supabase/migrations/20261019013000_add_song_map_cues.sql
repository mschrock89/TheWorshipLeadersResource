-- Song map notes for a service-flow song. Wednesday rehearsal writes them,
-- and the same weekend flow plays them back when the song's MIDI note starts.

create table if not exists public.song_map_cues (
  id uuid primary key default gen_random_uuid(),
  service_flow_item_id uuid not null references public.service_flow_items(id) on delete cascade,
  offset_seconds integer not null check (offset_seconds >= 0 and offset_seconds <= 7200),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  kind text not null default 'note' check (kind in ('note', 'mix')),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists song_map_cues_item_offset_idx
  on public.song_map_cues (service_flow_item_id, offset_seconds, created_at);

create trigger trg_song_map_cues_updated_at
before update on public.song_map_cues
for each row
execute function public.update_updated_at_column();

alter table public.song_map_cues enable row level security;

grant select, insert, update, delete on public.song_map_cues to authenticated;
grant all on public.song_map_cues to service_role;

create policy "Live can view song map cues"
  on public.song_map_cues
  for select
  using (
    exists (
      select 1
      from public.service_flow_items item
      join public.service_flows flow on flow.id = item.service_flow_id
      where item.id = service_flow_item_id
        and public.user_can_access_live_mode(auth.uid(), flow.campus_id)
    )
  );

create policy "Live can add song map cues"
  on public.song_map_cues
  for insert
  with check (
    exists (
      select 1
      from public.service_flow_items item
      join public.service_flows flow on flow.id = item.service_flow_id
      where item.id = service_flow_item_id
        and public.user_can_access_live_mode(auth.uid(), flow.campus_id)
    )
  );

create policy "Live can update song map cues"
  on public.song_map_cues
  for update
  using (
    exists (
      select 1
      from public.service_flow_items item
      join public.service_flows flow on flow.id = item.service_flow_id
      where item.id = service_flow_item_id
        and public.user_can_access_live_mode(auth.uid(), flow.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.service_flow_items item
      join public.service_flows flow on flow.id = item.service_flow_id
      where item.id = service_flow_item_id
        and public.user_can_access_live_mode(auth.uid(), flow.campus_id)
    )
  );

create policy "Live can delete song map cues"
  on public.song_map_cues
  for delete
  using (
    exists (
      select 1
      from public.service_flow_items item
      join public.service_flows flow on flow.id = item.service_flow_id
      where item.id = service_flow_item_id
        and public.user_can_access_live_mode(auth.uid(), flow.campus_id)
    )
  );

alter table public.song_map_cues replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'song_map_cues'
  ) then
    alter publication supabase_realtime add table public.song_map_cues;
  end if;
end $$;
