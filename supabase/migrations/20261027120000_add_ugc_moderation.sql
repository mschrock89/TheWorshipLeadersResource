create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self check (blocker_id <> blocked_user_id),
  constraint user_blocks_unique unique (blocker_id, blocked_user_id)
);

create index if not exists user_blocks_blocked_user_idx on public.user_blocks(blocked_user_id);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  content_type text not null check (content_type in ('chat_message', 'feed_post', 'feed_comment', 'user')),
  content_id uuid,
  reason text not null check (char_length(reason) between 1 and 500),
  content_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index if not exists moderation_reports_status_created_idx on public.moderation_reports(status, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.moderation_reports enable row level security;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert, update on public.moderation_reports to authenticated;

create policy "Users can view their own blocks" on public.user_blocks
  for select to authenticated using (blocker_id = auth.uid());
create policy "Users can create their own blocks" on public.user_blocks
  for insert to authenticated with check (blocker_id = auth.uid() and blocker_id <> blocked_user_id);
create policy "Users can remove their own blocks" on public.user_blocks
  for delete to authenticated using (blocker_id = auth.uid());

create policy "Users can submit moderation reports" on public.moderation_reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "Admins can review moderation reports" on public.moderation_reports
  for select to authenticated using (public.has_role(auth.uid(), 'admin'::public.app_role));
create policy "Admins can update moderation reports" on public.moderation_reports
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create or replace function public.is_user_blocked(_blocked_user_id uuid, _blocker_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
    where blocker_id = _blocker_id and blocked_user_id = _blocked_user_id
  );
$$;

create or replace function public.block_user_and_report(
  _blocked_user_id uuid,
  _content_type text,
  _content_id uuid,
  _reason text,
  _content_snapshot jsonb default '{}'::jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  _reporter_id uuid := auth.uid();
begin
  if _reporter_id is null then raise exception 'Sign in to block a user.'; end if;
  if _blocked_user_id is null or _blocked_user_id = _reporter_id then raise exception 'You cannot block yourself.'; end if;
  if _content_type not in ('chat_message', 'feed_post', 'feed_comment', 'user') then raise exception 'Invalid content type.'; end if;

  insert into public.user_blocks (blocker_id, blocked_user_id)
  values (_reporter_id, _blocked_user_id)
  on conflict (blocker_id, blocked_user_id) do nothing;

  insert into public.moderation_reports (reporter_id, reported_user_id, content_type, content_id, reason, content_snapshot)
  values (_reporter_id, _blocked_user_id, _content_type, _content_id, 'Blocked user: ' || left(coalesce(_reason, 'inappropriate content'), 450), coalesce(_content_snapshot, '{}'::jsonb));
end;
$$;

revoke all on function public.is_user_blocked(uuid, uuid) from public;
grant execute on function public.is_user_blocked(uuid, uuid) to authenticated;
revoke all on function public.block_user_and_report(uuid, text, uuid, text, jsonb) from public;
grant execute on function public.block_user_and_report(uuid, text, uuid, text, jsonb) to authenticated;

drop policy if exists "Authenticated users can view all messages" on public.chat_messages;
create policy "Authenticated users can view unblocked messages" on public.chat_messages
  for select to authenticated using (not public.is_user_blocked(user_id));

drop policy if exists "Authenticated users can view feed posts" on public.feed_posts;
create policy "Authenticated users can view unblocked feed posts" on public.feed_posts
  for select to authenticated using (not public.is_user_blocked(created_by));

drop policy if exists "Authenticated users can view feed comments" on public.feed_post_comments;
create policy "Authenticated users can view unblocked feed comments" on public.feed_post_comments
  for select to authenticated using (not public.is_user_blocked(user_id));
