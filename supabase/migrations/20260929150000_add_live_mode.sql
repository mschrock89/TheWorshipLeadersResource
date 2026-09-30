-- Live Mode: shared production console for FOH and MON monitors.
-- Talkback captions, the cued service-flow line, and booth notes stay in sync
-- across the two stations. Audio devices stay on each computer.

create or replace function public.user_can_access_live_mode(
  _user_id uuid,
  _campus_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_role(_user_id, 'admin'::app_role)
    or has_role(_user_id, 'production_manager'::app_role)
    or exists (
      select 1
      from public.user_ministry_campuses umc
      where umc.user_id = _user_id
        and umc.campus_id = _campus_id
        and umc.ministry_type in ('production', 'ms_hs_production', 'hs_production')
    )
    or exists (
      select 1
      from public.user_campus_ministry_positions ucmp
      where ucmp.user_id = _user_id
        and ucmp.campus_id = _campus_id
        and (
          ucmp.ministry_type in ('production', 'ms_hs_production', 'hs_production')
          or ucmp.position in (
            'sound_tech',
            'mon',
            'producer',
            'lighting',
            'media',
            'broadcast',
            'audio_shadow'
          )
        )
    );
$$;

create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null,
  service_date date not null,
  custom_service_id uuid null references public.custom_services(id) on delete set null,
  draft_set_id uuid null references public.draft_sets(id) on delete set null,
  resource_app_key text not null default 'worship',
  current_item_id uuid null,
  listener_client_id text null,
  listener_station text null check (listener_station in ('foh', 'mon')),
  listener_heartbeat timestamptz null,
  channels_initialized boolean not null default false,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists live_sessions_scope_idx
  on public.live_sessions (
    campus_id,
    ministry_type,
    service_date,
    resource_app_key,
    coalesce(custom_service_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists live_sessions_campus_date_idx
  on public.live_sessions (campus_id, service_date desc);

create trigger trg_live_sessions_updated_at
before update on public.live_sessions
for each row
execute function public.update_updated_at_column();

create table if not exists public.live_talkback_channels (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  position_slot text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists live_talkback_channels_session_slot_idx
  on public.live_talkback_channels (session_id, position_slot)
  where position_slot is not null;

create index if not exists live_talkback_channels_session_order_idx
  on public.live_talkback_channels (session_id, sort_order);

create table if not exists public.live_talkback_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  channel_id uuid not null references public.live_talkback_channels(id) on delete cascade,
  transcript text not null check (char_length(transcript) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists live_talkback_lines_session_created_idx
  on public.live_talkback_lines (session_id, created_at desc);

create table if not exists public.live_session_notes (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 8000),
  updated_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger trg_live_session_notes_updated_at
before update on public.live_session_notes
for each row
execute function public.update_updated_at_column();

alter table public.live_sessions enable row level security;
alter table public.live_talkback_channels enable row level security;
alter table public.live_talkback_lines enable row level security;
alter table public.live_session_notes enable row level security;

create policy "Production can view live sessions"
  on public.live_sessions
  for select
  using (public.user_can_access_live_mode(auth.uid(), campus_id));

create policy "Production can create live sessions"
  on public.live_sessions
  for insert
  with check (
    auth.uid() = created_by
    and public.user_can_access_live_mode(auth.uid(), campus_id)
  );

create policy "Production can update live sessions"
  on public.live_sessions
  for update
  using (public.user_can_access_live_mode(auth.uid(), campus_id))
  with check (public.user_can_access_live_mode(auth.uid(), campus_id));

create policy "Production can view talkback channels"
  on public.live_talkback_channels
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can create talkback channels"
  on public.live_talkback_channels
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can update talkback channels"
  on public.live_talkback_channels
  for update
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can delete talkback channels"
  on public.live_talkback_channels
  for delete
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can view talkback lines"
  on public.live_talkback_lines
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can create talkback lines"
  on public.live_talkback_lines
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can delete talkback lines"
  on public.live_talkback_lines
  for delete
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can view live notes"
  on public.live_session_notes
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can create live notes"
  on public.live_session_notes
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can update live notes"
  on public.live_session_notes
  for update
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

alter table public.live_sessions replica identity full;
alter table public.live_talkback_channels replica identity full;
alter table public.live_talkback_lines replica identity full;
alter table public.live_session_notes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_talkback_channels'
  ) then
    alter publication supabase_realtime add table public.live_talkback_channels;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_talkback_lines'
  ) then
    alter publication supabase_realtime add table public.live_talkback_lines;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_session_notes'
  ) then
    alter publication supabase_realtime add table public.live_session_notes;
  end if;
end $$;

create or replace function public.ensure_live_session(
  _campus_id uuid,
  _ministry_type text,
  _service_date date,
  _custom_service_id uuid default null,
  _draft_set_id uuid default null,
  _resource_app_key text default 'worship'
)
returns setof public.live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  _session public.live_sessions;
begin
  if auth.uid() is null or not public.user_can_access_live_mode(auth.uid(), _campus_id) then
    raise exception 'forbidden';
  end if;

  select *
  into _session
  from public.live_sessions
  where campus_id = _campus_id
    and ministry_type = _ministry_type
    and service_date = _service_date
    and resource_app_key = coalesce(nullif(_resource_app_key, ''), 'worship')
    and custom_service_id is not distinct from _custom_service_id
  limit 1;

  if _session.id is null then
    begin
      insert into public.live_sessions (
        campus_id,
        ministry_type,
        service_date,
        custom_service_id,
        draft_set_id,
        resource_app_key,
        created_by
      )
      values (
        _campus_id,
        _ministry_type,
        _service_date,
        _custom_service_id,
        _draft_set_id,
        coalesce(nullif(_resource_app_key, ''), 'worship'),
        auth.uid()
      )
      returning * into _session;
    exception
      when unique_violation then
        select *
        into _session
        from public.live_sessions
        where campus_id = _campus_id
          and ministry_type = _ministry_type
          and service_date = _service_date
          and resource_app_key = coalesce(nullif(_resource_app_key, ''), 'worship')
          and custom_service_id is not distinct from _custom_service_id
        limit 1;
    end;
  elsif _draft_set_id is not null and _session.draft_set_id is distinct from _draft_set_id then
    update public.live_sessions
    set draft_set_id = _draft_set_id
    where id = _session.id
    returning * into _session;
  end if;

  if _session.id is null then
    return;
  end if;

  if not _session.channels_initialized then
    insert into public.live_talkback_channels (session_id, label, position_slot, sort_order)
    select _session.id, seed.label, seed.position_slot, seed.sort_order
    from (
      values
        ('Worship Leader'::text, 'vocalist_1'::text, 0),
        ('Vocals', 'vocalist_2', 1),
        ('Drums', 'drums', 2),
        ('Bass', 'bass', 3),
        ('Keys', 'keys', 4),
        ('Electric', 'eg_1', 5),
        ('Acoustic', 'ag_1', 6),
        ('Pastor', 'teacher', 7)
    ) as seed(label, position_slot, sort_order)
    on conflict (session_id, position_slot) where position_slot is not null do nothing;

    update public.live_sessions
    set channels_initialized = true
    where id = _session.id;
  end if;

  return query
  select *
  from public.live_sessions
  where id = _session.id;
end;
$$;

revoke all on function public.ensure_live_session(uuid, text, date, uuid, uuid, text) from public;
grant execute on function public.ensure_live_session(uuid, text, date, uuid, uuid, text) to authenticated;
