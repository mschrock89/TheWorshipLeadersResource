-- Administrators can block a reported post, comment, or message.
-- The row stays in place with its text removed so the feed shows it as revoked.

alter table public.feed_posts
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

alter table public.feed_post_comments
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

alter table public.chat_messages
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles(id) on delete set null;

create or replace function public.keep_revoked_feed_post()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
    new.revoked_by := old.revoked_by;
    new.title := 'This post was revoked';
    new.body := null;
    new.scripture_reference := null;
    new.youtube_url := null;
    new.youtube_video_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.keep_revoked_feed_comment()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
    new.revoked_by := old.revoked_by;
    new.body := 'This comment was revoked';
  end if;
  return new;
end;
$$;

create or replace function public.keep_revoked_chat_message()
returns trigger
language plpgsql
as $$
begin
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;
    new.revoked_by := old.revoked_by;
    new.content := 'This message was revoked';
    new.attachments := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_keep_revoked_feed_post on public.feed_posts;
create trigger trg_keep_revoked_feed_post
before update on public.feed_posts
for each row
execute function public.keep_revoked_feed_post();

drop trigger if exists trg_keep_revoked_feed_comment on public.feed_post_comments;
create trigger trg_keep_revoked_feed_comment
before update on public.feed_post_comments
for each row
execute function public.keep_revoked_feed_comment();

drop trigger if exists trg_keep_revoked_chat_message on public.chat_messages;
create trigger trg_keep_revoked_chat_message
before update on public.chat_messages
for each row
execute function public.keep_revoked_chat_message();

create or replace function public.revoke_reported_content(_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _report public.moderation_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in to review reports.';
  end if;
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only administrators can block reported content.';
  end if;

  select * into _report
  from public.moderation_reports
  where id = _report_id;

  if not found then
    raise exception 'Report not found.';
  end if;
  if _report.content_id is null then
    raise exception 'This report is not tied to a specific post or message.';
  end if;

  if _report.content_type = 'feed_post' then
    update public.feed_posts
    set
      revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, auth.uid()),
      title = 'This post was revoked',
      body = null,
      scripture_reference = null,
      youtube_url = null,
      youtube_video_id = null
    where id = _report.content_id;
    if not found then
      raise exception 'That post is no longer available.';
    end if;
    delete from public.feed_poll_options where post_id = _report.content_id;
  elsif _report.content_type = 'feed_comment' then
    update public.feed_post_comments
    set
      revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, auth.uid()),
      body = 'This comment was revoked'
    where id = _report.content_id;
    if not found then
      raise exception 'That comment is no longer available.';
    end if;
  elsif _report.content_type = 'chat_message' then
    update public.chat_messages
    set
      revoked_at = coalesce(revoked_at, now()),
      revoked_by = coalesce(revoked_by, auth.uid()),
      content = 'This message was revoked',
      attachments = null
    where id = _report.content_id;
    if not found then
      raise exception 'That message is no longer available.';
    end if;
  else
    raise exception 'This report cannot be blocked as a single piece of content.';
  end if;

  update public.moderation_reports
  set
    status = 'resolved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = _report.id;
end;
$$;

revoke all on function public.revoke_reported_content(uuid) from public;
grant execute on function public.revoke_reported_content(uuid) to authenticated;

notify pgrst, 'reload schema';
