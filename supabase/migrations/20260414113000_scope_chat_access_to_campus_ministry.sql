create or replace function public.normalize_chat_ministry_type(_ministry_type text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(_ministry_type, 'weekend') in ('weekend', 'weekend_team', 'sunday_am') then 'weekend'
    else coalesce(_ministry_type, 'weekend')
  end
$$;

create or replace function public.user_can_access_chat(
  _user_id uuid,
  _campus_id uuid,
  _ministry_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_role(_user_id, 'admin'::app_role)
    or exists (
      select 1
      from public.user_ministry_campuses umc
      where umc.user_id = _user_id
        and umc.campus_id = _campus_id
        and public.normalize_chat_ministry_type(umc.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
    );
$$;

drop policy if exists "Users can insert messages to their campuses" on public.chat_messages;
create policy "Users can insert messages to their campuses"
on public.chat_messages
for insert
with check (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can view messages from their campuses" on public.chat_messages;
create policy "Users can view messages from their campuses"
on public.chat_messages
for select
using (
  public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can delete their own messages" on public.chat_messages;
create policy "Users can delete their own messages"
on public.chat_messages
for delete
using (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can update their own recent messages" on public.chat_messages;
create policy "Users can update their own recent messages"
on public.chat_messages
for update
using (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
  and created_at > (now() - '00:15:00'::interval)
)
with check (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can view own read status" on public.message_read_status;
create policy "Users can view own read status"
on public.message_read_status
for select
using (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can insert own read status" on public.message_read_status;
create policy "Users can insert own read status"
on public.message_read_status
for insert
with check (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

drop policy if exists "Users can update own read status" on public.message_read_status;
create policy "Users can update own read status"
on public.message_read_status
for update
using (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
)
with check (
  auth.uid() = user_id
  and public.user_can_access_chat(auth.uid(), campus_id, coalesce(ministry_type, 'weekend'))
);

create or replace function public.get_profiles_for_chat_mention(
  _campus_id uuid,
  _ministry_type text
)
returns table(id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.full_name, p.avatar_url
  from public.profiles p
  inner join public.user_ministry_campuses umc
    on umc.user_id = p.id
  where umc.campus_id = _campus_id
    and public.normalize_chat_ministry_type(umc.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
  order by p.full_name;
$$;
