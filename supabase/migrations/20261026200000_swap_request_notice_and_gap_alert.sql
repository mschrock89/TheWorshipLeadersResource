-- Swap requests need 7 days of notice. Once a pending request is inside that
-- window and still unanswered, tell the campus admin and the ministry leads
-- who already receive swap confirmations that the date may be a gap.

alter table public.swap_requests
  add column if not exists unanswered_gap_notified_at timestamptz;

comment on column public.swap_requests.unanswered_gap_notified_at is
  'When admins were notified that this pending swap was still unanswered inside the 7-day window.';

create index if not exists swap_requests_unanswered_gap_idx
  on public.swap_requests (original_date)
  where status = 'pending'::public.swap_request_status
    and unanswered_gap_notified_at is null;

create or replace function public.swap_date_is_too_soon(p_date date)
returns boolean
language sql
stable
as $$
  select p_date < (timezone('America/Chicago', now()))::date + 7;
$$;

create or replace function public.reject_short_notice_swap_requests()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from 'pending'::public.swap_request_status then
      return new;
    end if;
    if new.original_date is not distinct from old.original_date
       and new.swap_date is not distinct from old.swap_date then
      return new;
    end if;
  end if;

  if public.swap_date_is_too_soon(new.original_date)
     or (new.swap_date is not null and public.swap_date_is_too_soon(new.swap_date)) then
    raise exception 'Swap requests must be submitted at least 7 days before the date.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists reject_short_notice_swap_requests on public.swap_requests;

create trigger reject_short_notice_swap_requests
before insert or update of original_date, swap_date, status
on public.swap_requests
for each row
execute function public.reject_short_notice_swap_requests();

-- Campus admin for the swap's campus, plus the same ministry leads who are
-- notified when a swap is confirmed. Network-wide pastors stay in that set so
-- a campus without a local admin still hears about the gap.
create or replace function public.swap_gap_admin_user_ids(
  p_campus_id uuid,
  p_ministry_type text,
  p_position text,
  p_exclude_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_ministry text;
  normalized_position text;
  recipient_ids jsonb;
begin
  if p_campus_id is null then
    return '[]'::jsonb;
  end if;

  normalized_ministry := case
    when coalesce(p_ministry_type, 'weekend') in ('weekend', 'weekend_team', 'sunday_am', 'speaker') then 'weekend_team'
    else coalesce(p_ministry_type, 'weekend')
  end;

  normalized_position := regexp_replace(lower(coalesce(p_position, '')), '[\s-]+', '_', 'g');

  select jsonb_agg(distinct recipient_id)
  into recipient_ids
  from (
    select ur.user_id::text as recipient_id
    from public.user_roles ur
    where ur.role = 'campus_admin'
      and ur.admin_campus_id = p_campus_id
      and ur.user_id is distinct from p_exclude_user_id

    union

    select ur.user_id::text
    from public.user_roles ur
    join public.user_ministry_campuses umc
      on umc.user_id = ur.user_id
     and umc.campus_id = p_campus_id
     and umc.ministry_type = normalized_ministry
    where ur.user_id is distinct from p_exclude_user_id
      and (
        (
          (
            normalized_position in (
              'front_of_house',
              'lighting',
              'broadcast_mix',
              'producer',
              'stage_manager',
              'engineer'
            )
            or (
              normalized_position not in (
                'video_director',
                'camera_operator',
                'video_switcher',
                'pro_presenter',
                'graphics',
                'director',
                'switcher',
                'tri_pod_camera',
                'hand_held_camera',
                'other'
              )
              and normalized_ministry = 'production'
            )
          )
          and ur.role = 'production_manager'
        )
        or (
          (
            normalized_position in (
              'video_director',
              'camera_operator',
              'video_switcher',
              'pro_presenter',
              'graphics',
              'director',
              'switcher',
              'tri_pod_camera',
              'hand_held_camera',
              'other'
            )
            or (
              normalized_position not in (
                'front_of_house',
                'lighting',
                'broadcast_mix',
                'producer',
                'stage_manager',
                'engineer'
              )
              and normalized_ministry = 'video'
            )
          )
          and ur.role in ('video_director', 'production_manager')
        )
        or (
          normalized_ministry not in ('video', 'production')
          and ur.role in (
            'campus_worship_pastor',
            'student_worship_pastor',
            'network_worship_pastor',
            'network_worship_leader'
          )
        )
      )
  ) recipients;

  return coalesce(recipient_ids, '[]'::jsonb);
end;
$$;

revoke all on function public.swap_gap_admin_user_ids(uuid, text, text, uuid) from public;
revoke all on function public.swap_gap_admin_user_ids(uuid, text, text, uuid) from anon;
revoke all on function public.swap_gap_admin_user_ids(uuid, text, text, uuid) from authenticated;

create or replace function public.run_unanswered_swap_gap_notices()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  local_hour int;
  local_minute int;
  church_today date;
  supabase_url text;
  service_key text;
  rec record;
  requester_name text;
  team_name text;
  request_date text;
  position_label text;
  campus_id uuid;
  ministry_type text;
  recipient_ids jsonb;
begin
  local_now := timezone('America/Chicago', now());
  local_hour := extract(hour from local_now);
  local_minute := extract(minute from local_now);

  -- Once per day at 8:00 AM America/Chicago. The cron itself fires hourly.
  if local_hour <> 8 or local_minute <> 0 then
    return;
  end if;

  church_today := local_now::date;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('run_unanswered_swap_gap_notices') c;

  if supabase_url is null or service_key is null then
    return;
  end if;

  for rec in
    select
      sr.id,
      sr.requester_id,
      sr.original_date,
      sr.swap_date,
      sr.position,
      sr.team_id,
      sr.campus_id,
      sr.ministry_type,
      sr.resource_app_key
    from public.swap_requests sr
    where sr.status = 'pending'::public.swap_request_status
      and sr.unanswered_gap_notified_at is null
      and sr.original_date >= church_today
      and sr.original_date < church_today + 7
  loop
    campus_id := rec.campus_id;
    ministry_type := rec.ministry_type;

    if campus_id is null or ministry_type is null then
      select ts.campus_id, ts.ministry_type
      into campus_id, ministry_type
      from public.team_schedule ts
      where ts.team_id = rec.team_id
        and ts.schedule_date = rec.original_date
      limit 1;

      campus_id := coalesce(rec.campus_id, campus_id);
      ministry_type := coalesce(rec.ministry_type, ministry_type, 'weekend');
    end if;

    recipient_ids := public.swap_gap_admin_user_ids(
      campus_id,
      ministry_type,
      rec.position,
      rec.requester_id
    );

    if recipient_ids is null or jsonb_array_length(recipient_ids) = 0 then
      continue;
    end if;

    select full_name into requester_name
    from public.profiles
    where id = rec.requester_id;

    select name into team_name
    from public.worship_teams
    where id = rec.team_id;

    request_date := to_char(rec.original_date, 'Mon DD, YYYY');
    position_label := initcap(replace(coalesce(rec.position, 'serving'), '_', ' '));

    begin
      update public.swap_requests
      set unanswered_gap_notified_at = now()
      where id = rec.id
        and unanswered_gap_notified_at is null
        and status = 'pending'::public.swap_request_status;

      if found then
        perform net.http_post(
          url := supabase_url || '/functions/v1/send-push-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || service_key
          ),
          body := jsonb_build_object(
            'title', 'Possible schedule gap',
            'message', coalesce(requester_name, 'A team member') || ' still needs coverage for ' || position_label || ' on ' || request_date || '. That swap is unanswered, so ' || coalesce(team_name, 'the team') || ' may have a gap.',
            'url', '/swaps',
            'tag', 'swap-gap-' || rec.id::text,
            'userIds', recipient_ids,
            'contextType', 'swap-unanswered-gap',
            'contextId', rec.id::text,
            'metadata', jsonb_build_object(
              'resourceAppKey', coalesce(rec.resource_app_key, 'worship'),
              'ministryType', ministry_type,
              'vars', jsonb_build_object(
                'requester', coalesce(nullif(btrim(requester_name), ''), 'A team member'),
                'position', position_label,
                'date', request_date,
                'team', coalesce(nullif(btrim(team_name), ''), 'their team')
              )
            )
          )
        );
      end if;
    exception when others then
      raise warning 'unanswered swap gap notice failed for %: %', rec.id, sqlerrm;
    end;
  end loop;
end;
$$;

revoke all on function public.run_unanswered_swap_gap_notices() from public;
revoke all on function public.run_unanswered_swap_gap_notices() from anon;
revoke all on function public.run_unanswered_swap_gap_notices() from authenticated;

insert into public.push_notification_definitions (
  key, label, category, description, trigger_description, recipients_description,
  title_template, body_template, deep_link_url, template_variables,
  enabled, content_from_db, is_system, sort_order
) values (
  'swap-unanswered-gap',
  'Unanswered Swap Gap',
  'Swaps',
  'Warns the campus admin that a swap is still unanswered inside the 7-day notice window.',
  'Daily at 8:00 AM America/Chicago while a swap request is pending and its date is fewer than 7 days away',
  'Campus admin for that campus, plus the ministry leads who receive swap confirmations',
  'Possible schedule gap',
  '{{requester}} still needs coverage for {{position}} on {{date}}. That swap is unanswered, so {{team}} may have a gap.',
  '/swaps',
  array['requester', 'position', 'date', 'team'],
  true,
  true,
  true,
  125
)
on conflict (key) do update set
  label = excluded.label,
  category = excluded.category,
  description = excluded.description,
  trigger_description = excluded.trigger_description,
  recipients_description = excluded.recipients_description,
  title_template = excluded.title_template,
  body_template = excluded.body_template,
  deep_link_url = excluded.deep_link_url,
  template_variables = excluded.template_variables,
  content_from_db = excluded.content_from_db,
  sort_order = excluded.sort_order,
  updated_at = now();

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'unanswered-swap-gap-notice'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'unanswered-swap-gap-notice',
    '0 * * * *',
    $cron$select public.run_unanswered_swap_gap_notices();$cron$
  );
end
$$;
