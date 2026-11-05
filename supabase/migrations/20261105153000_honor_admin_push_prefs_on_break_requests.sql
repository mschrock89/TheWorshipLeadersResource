-- Sitting someone from Team Builder is not a break request, so it does not
-- notify leaders. Real break requests include the rotation's campus so the
-- profile notification menu can override the Org Admin audience.

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

  if coalesce(new.reason, '') like 'Sat from Team Builder%' then
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

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      where ur.role = 'campus_worship_pastor'
        and shares_campus_with(ur.user_id, new.user_id)

      union

      select ur.user_id::text as recipient_id
      from public.user_roles ur
      join public.user_campuses uc
        on uc.user_id = new.user_id
      where ur.role = 'campus_admin'
        and ur.admin_campus_id = uc.campus_id
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
