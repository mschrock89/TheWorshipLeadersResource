-- Split The Feed by ministry, on top of the existing per-campus scope.
-- A feed is now identified by (resource_app_key, campus_id, ministry_type).
--
-- Non-destructive backfill: every campus's existing main-app posts become that
-- campus's default-ministry feed, so nothing is lost -- worship posts land in
-- "weekend" (so Murfreesboro Central's current feed becomes Weekend Worship for
-- Central, and every other campus keeps its posts as its own Weekend feed), and
-- student posts land in "leader_chat". All other ministry feeds start empty.
-- Camp Mode feeds stay scoped by camp_instance_id and keep ministry_type null.

alter table public.feed_posts
  add column if not exists ministry_type text;

update public.feed_posts
set ministry_type = 'weekend'
where camp_instance_id is null
  and campus_id is not null
  and ministry_type is null
  and resource_app_key = 'worship';

update public.feed_posts
set ministry_type = 'leader_chat'
where camp_instance_id is null
  and campus_id is not null
  and ministry_type is null
  and resource_app_key in ('students_hs', 'students_ms');

create index if not exists feed_posts_resource_app_campus_ministry_created_at_idx
  on public.feed_posts(resource_app_key, campus_id, ministry_type, created_at desc)
  where camp_instance_id is null;

notify pgrst, 'reload schema';
