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
          'userIds', jsonb_build_array(new.requester_id::text)
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
              and ur.role = 'video_director'
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
          and ur.user_id <> new.accepted_by_id;

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
              'userIds', leader_user_ids
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
