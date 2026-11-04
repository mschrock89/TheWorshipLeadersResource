-- Admin-audience pushes only go to admins who cover that campus.
-- Campus Admin assignments win. An org admin or network pastor who is
-- assigned to campuses only hears about those campuses. Someone with no
-- campus assignment stays network-wide. Personal pushes (roster, chat,
-- a swap addressed to you) do not use this check.

create or replace function public.admin_receives_campus_push(_user_id uuid, _campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with campus_admin_campuses as (
    select ur.admin_campus_id as campus_id
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role = 'campus_admin'
      and ur.admin_campus_id is not null
  ),
  assigned as (
    select uc.campus_id
    from public.user_campuses uc
    where uc.user_id = _user_id
  )
  select
    _campus_id is null
    or case
      when exists (select 1 from campus_admin_campuses)
        then exists (select 1 from campus_admin_campuses where campus_id = _campus_id)
      when exists (
        select 1
        from public.user_roles ur
        where ur.user_id = _user_id
          and ur.role in (
            'admin',
            'campus_admin',
            'network_worship_pastor',
            'network_worship_leader'
          )
      )
      and exists (select 1 from assigned)
        then exists (select 1 from assigned where campus_id = _campus_id)
      else true
    end;
$$;

revoke all on function public.admin_receives_campus_push(uuid, uuid) from public;
revoke all on function public.admin_receives_campus_push(uuid, uuid) from anon;
revoke all on function public.admin_receives_campus_push(uuid, uuid) from authenticated;


create or replace function public.notify_break_request_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  requester_name text;
  period_name text;
  request_type_label text;
  recipient_user_ids jsonb;
  supabase_url text;
  service_key text;
  period_campus_id uuid;
begin
  if new.request_scope = 'blackout_dates' then
    return new;
  end if;

  select full_name into requester_name from profiles where id = new.user_id;
  select name, campus_id into period_name, period_campus_id from rotation_periods where id = new.rotation_period_id;

  request_type_label := case
    when new.request_type = 'willing_break' then 'is willing to take a break'
    else 'needs a break'
  end;

  if period_campus_id is null then
    recipient_user_ids := jsonb_build_array(
      'dd1c6bc4-c527-4fa0-8ca1-8ed50a2674f9',
      '22c10f05-955a-498c-b18f-2ac570868b35'
    );
  else
    select jsonb_agg(distinct recipient_id)
    into recipient_user_ids
    from (
      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role in ('admin', 'network_worship_pastor', 'network_worship_leader')
        and public.admin_receives_campus_push(ur.user_id, period_campus_id)

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role = 'campus_worship_pastor'
        and shares_campus_with(ur.user_id, new.user_id)
        and public.admin_receives_campus_push(ur.user_id, period_campus_id)

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role = 'campus_admin'
        and ur.admin_campus_id = period_campus_id
    ) recipients;
  end if;

  begin
    select decrypted_secret into supabase_url
    from vault.decrypted_secrets
    where name = 'supabase_url'
    limit 1;

    select decrypted_secret into service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception when others then
    return new;
  end;

  if recipient_user_ids is not null and jsonb_array_length(recipient_user_ids) > 0
     and supabase_url is not null and service_key is not null then
    perform net.http_post(
      url := supabase_url || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'title', 'Break Request',
        'message', coalesce(requester_name, 'Someone') || ' ' || request_type_label || ' for ' || coalesce(period_name, 'a rotation period'),
        'url', '/team-builder',
        'tag', 'break-request-' || new.id::text,
        'userIds', recipient_user_ids,
        'metadata', jsonb_build_object(
          'resourceAppKey', 'worship',
          'campusId', period_campus_id,
          'vars', jsonb_build_object(
            'name', coalesce(requester_name, 'Someone'),
            'request_phrase', request_type_label,
            'period', coalesce(period_name, 'this trimester')
          )
        )
      )
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_break_request_created failed: %', sqlerrm;
  return new;
end;
$function$;


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
  ) recipients
  where public.admin_receives_campus_push(recipient_id::uuid, p_campus_id);

  return coalesce(recipient_ids, '[]'::jsonb);
end;
$$;


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
              'campusId', campus_id,
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


create or replace function public.notify_swap_request_resolved()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  accepter_name text;
  requester_name text;
  request_date text;
  notification_title text;
  notification_message text;
  supabase_url text;
  service_key text;
  swap_campus_id uuid;
  swap_ministry_type text;
  normalized_swap_ministry_type text;
  normalized_position text;
  leader_user_ids jsonb;
begin
  -- Only trigger when status changes to accepted or declined
  if new.status in ('accepted', 'declined') and old.status = 'pending' then
    request_date := to_char(new.original_date::date, 'Mon DD, YYYY');

    -- Get the campus_id and ministry_type from team_schedule for this swap
    select ts.campus_id, coalesce(ts.ministry_type, 'weekend')
    into swap_campus_id, swap_ministry_type
    from public.team_schedule ts
    where ts.team_id = new.team_id
      and ts.schedule_date = new.original_date
    limit 1;

    normalized_swap_ministry_type := case
      when coalesce(swap_ministry_type, 'weekend') in ('weekend', 'weekend_team', 'sunday_am', 'speaker') then 'weekend_team'
      else coalesce(swap_ministry_type, 'weekend')
    end;

    normalized_position := regexp_replace(lower(coalesce(new.position, '')), '[\s-]+', '_', 'g');

    if new.status = 'accepted' then
      select full_name into accepter_name from public.profiles where id = new.accepted_by_id;
      select full_name into requester_name from public.profiles where id = new.requester_id;
      notification_title := 'Swap Accepted';
      notification_message := coalesce(accepter_name, 'Someone') || ' will cover your date on ' || request_date;
    else
      notification_title := 'Swap Declined';
      notification_message := 'Your swap request for ' || request_date || ' was declined';
    end if;

    -- Try to get the URL and key from vault secrets
    begin
      select decrypted_secret into supabase_url
      from vault.decrypted_secrets
      where name = 'supabase_url'
      limit 1;

      select decrypted_secret into service_key
      from vault.decrypted_secrets
      where name = 'service_role_key'
      limit 1;
    exception when others then
      return new;
    end;

    -- Only proceed if we have both values
    if supabase_url is not null and service_key is not null then
      -- Notify the requester
      perform net.http_post(
        url := supabase_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'title', notification_title,
          'message', notification_message,
          'url', '/swaps',
          'tag', 'swap-resolved-' || new.id::text,
          'userIds', jsonb_build_array(new.requester_id::text),
          'metadata', jsonb_build_object('resourceAppKey', coalesce(new.resource_app_key, 'worship'))
        )
      );

      -- If accepted, notify only the lead(s) responsible for the swapped position.
      if new.status = 'accepted' and swap_campus_id is not null then
        select jsonb_agg(distinct ur.user_id::text)
        into leader_user_ids
        from public.user_roles ur
        join public.user_ministry_campuses umc
          on umc.user_id = ur.user_id
         and umc.campus_id = swap_campus_id
         and umc.ministry_type = normalized_swap_ministry_type
        where (
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
                  and normalized_swap_ministry_type = 'production'
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
                  and normalized_swap_ministry_type = 'video'
                )
              )
              and ur.role in ('video_director', 'production_manager')
            )
            or (
              normalized_swap_ministry_type not in ('video', 'production')
              and ur.role in (
                'campus_worship_pastor',
                'student_worship_pastor',
                'network_worship_pastor',
                'network_worship_leader'
              )
            )
          )
          and ur.user_id <> new.requester_id
          and ur.user_id <> new.accepted_by_id
          and public.admin_receives_campus_push(ur.user_id, swap_campus_id);

        if leader_user_ids is not null and jsonb_array_length(leader_user_ids) > 0 then
          perform net.http_post(
            url := supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || service_key
            ),
            body := jsonb_build_object(
              'title', 'Swap Confirmed',
              'message', coalesce(accepter_name, 'Someone') || ' is covering for ' || coalesce(requester_name, 'a team member') || ' on ' || request_date,
              'url', '/swaps',
              'tag', 'swap-leads-' || new.id::text,
              'userIds', leader_user_ids,
              'contextType', 'swap-confirmed',
              'metadata', jsonb_build_object(
                'resourceAppKey', coalesce(new.resource_app_key, 'worship'),
                'campusId', swap_campus_id
              )
            )
          );
        end if;
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'notify_swap_request_resolved failed: %', sqlerrm;
  return new;
end;
$function$;



update public.push_notification_definitions
set recipients_description = 'Admins who cover that campus and oversee the ministry, or the person who built the set'
where key = 'setlist-confirmed';

update public.push_notification_definitions
set recipients_description = 'Admins and ministry leads who cover that campus'
where key = 'swap-confirmed';

update public.push_notification_definitions
set recipients_description = 'Campus admins and ministry leads who cover that campus'
where key = 'swap-unanswered-gap';

update public.push_notification_definitions
set recipients_description = 'Campus admins, campus worship pastors, and network leaders who cover that campus'
where key = 'break-request';
