-- Let video volunteers open Live, without the talkback transcript or production chat.
-- They share a separate chat room with production.

create or replace function public.user_can_access_production_live(
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

create or replace function public.user_can_access_video_live(
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
    or has_role(_user_id, 'video_director'::app_role)
    or exists (
      select 1
      from public.user_ministry_campuses umc
      where umc.user_id = _user_id
        and umc.campus_id = _campus_id
        and umc.ministry_type = 'video'
    )
    or exists (
      select 1
      from public.user_campus_ministry_positions ucmp
      where ucmp.user_id = _user_id
        and ucmp.campus_id = _campus_id
        and (
          ucmp.ministry_type = 'video'
          or ucmp.position in (
            'tri_pod_camera',
            'tri_pod_camera_1',
            'tri_pod_camera_2',
            'tri_pod_camera_3',
            'tri_pod_camera_4',
            'hand_held_camera',
            'hand_held_camera_1',
            'hand_held_camera_2',
            'hand_held_camera_3',
            'hand_held_camera_4',
            'director',
            'director_2',
            'director_3',
            'director_4',
            'graphics',
            'graphics_2',
            'graphics_3',
            'graphics_4',
            'switcher',
            'switcher_2',
            'switcher_3',
            'switcher_4'
          )
        )
    );
$$;

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
    public.user_can_access_production_live(_user_id, _campus_id)
    or public.user_can_access_video_live(_user_id, _campus_id);
$$;

drop policy if exists "Production can update live sessions" on public.live_sessions;
create policy "Production can update live sessions"
  on public.live_sessions
  for update
  using (public.user_can_access_production_live(auth.uid(), campus_id))
  with check (public.user_can_access_production_live(auth.uid(), campus_id));

drop policy if exists "Production can view talkback channels" on public.live_talkback_channels;
create policy "Production can view talkback channels"
  on public.live_talkback_channels
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can create talkback channels" on public.live_talkback_channels;
create policy "Production can create talkback channels"
  on public.live_talkback_channels
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can update talkback channels" on public.live_talkback_channels;
create policy "Production can update talkback channels"
  on public.live_talkback_channels
  for update
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can delete talkback channels" on public.live_talkback_channels;
create policy "Production can delete talkback channels"
  on public.live_talkback_channels
  for delete
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can view talkback lines" on public.live_talkback_lines;
create policy "Production can view talkback lines"
  on public.live_talkback_lines
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can create talkback lines" on public.live_talkback_lines;
create policy "Production can create talkback lines"
  on public.live_talkback_lines
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can delete talkback lines" on public.live_talkback_lines;
create policy "Production can delete talkback lines"
  on public.live_talkback_lines
  for delete
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can view live notes" on public.live_session_notes;
create policy "Production can view live notes"
  on public.live_session_notes
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can create live notes" on public.live_session_notes;
create policy "Production can create live notes"
  on public.live_session_notes
  for insert
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

drop policy if exists "Production can update live notes" on public.live_session_notes;
create policy "Production can update live notes"
  on public.live_session_notes
  for update
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_production_live(auth.uid(), s.campus_id)
    )
  );

alter table public.live_chat_messages
  add column if not exists room text not null default 'production';

alter table public.live_chat_messages
  drop constraint if exists live_chat_messages_room_check;

alter table public.live_chat_messages
  add constraint live_chat_messages_room_check
  check (room in ('production', 'video'));

drop policy if exists "Production can view live chat" on public.live_chat_messages;
drop policy if exists "Production can send live chat" on public.live_chat_messages;
drop policy if exists "Live teams can view their chat" on public.live_chat_messages;
drop policy if exists "Live teams can send their chat" on public.live_chat_messages;

create policy "Live teams can view their chat"
  on public.live_chat_messages
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and (
          (
            room = 'production'
            and public.user_can_access_production_live(auth.uid(), s.campus_id)
          )
          or (
            room = 'video'
            and (
              public.user_can_access_production_live(auth.uid(), s.campus_id)
              or public.user_can_access_video_live(auth.uid(), s.campus_id)
            )
          )
        )
    )
  );

create policy "Live teams can send their chat"
  on public.live_chat_messages
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and (
          (
            room = 'production'
            and public.user_can_access_production_live(auth.uid(), s.campus_id)
          )
          or (
            room = 'video'
            and (
              public.user_can_access_production_live(auth.uid(), s.campus_id)
              or public.user_can_access_video_live(auth.uid(), s.campus_id)
            )
          )
        )
    )
  );
