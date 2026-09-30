-- Chat for one live service. This is not the weekly production team chat.

create table if not exists public.live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists live_chat_messages_session_created_idx
  on public.live_chat_messages (session_id, created_at desc);

alter table public.live_chat_messages enable row level security;

grant select, insert on public.live_chat_messages to authenticated;
grant all on public.live_chat_messages to service_role;

create policy "Production can view live chat"
  on public.live_chat_messages
  for select
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

create policy "Production can send live chat"
  on public.live_chat_messages
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.live_sessions s
      where s.id = session_id
        and public.user_can_access_live_mode(auth.uid(), s.campus_id)
    )
  );

alter table public.live_chat_messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_chat_messages'
  ) then
    alter publication supabase_realtime add table public.live_chat_messages;
  end if;
end $$;
