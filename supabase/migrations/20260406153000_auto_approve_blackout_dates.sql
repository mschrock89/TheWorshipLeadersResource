create or replace function public.can_view_break_request_row(_request_user_id uuid, _rotation_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'network_worship_leader'::app_role)
    or (
      public.is_network_wide_rotation_period(_rotation_period_id)
      and (
        has_role(auth.uid(), 'campus_worship_pastor'::app_role)
        or exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'campus_admin'::app_role
        )
      )
    )
    or (
      not public.is_network_wide_rotation_period(_rotation_period_id)
      and has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      and shares_campus_with(auth.uid(), _request_user_id)
    )
    or (
      not public.is_network_wide_rotation_period(_rotation_period_id)
      and exists (
        select 1
        from public.user_roles ur
        join public.user_campuses uc
          on uc.user_id = _request_user_id
        where ur.user_id = auth.uid()
          and ur.role = 'campus_admin'::app_role
          and ur.admin_campus_id = uc.campus_id
      )
    )
$$;

create or replace function public.can_review_break_request_row(_request_user_id uuid, _rotation_period_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'network_worship_leader'::app_role)
    or (
      not public.is_network_wide_rotation_period(_rotation_period_id)
      and has_role(auth.uid(), 'campus_worship_pastor'::app_role)
      and shares_campus_with(auth.uid(), _request_user_id)
    )
    or (
      not public.is_network_wide_rotation_period(_rotation_period_id)
      and exists (
        select 1
        from public.user_roles ur
        join public.user_campuses uc
          on uc.user_id = _request_user_id
        where ur.user_id = auth.uid()
          and ur.role = 'campus_admin'::app_role
          and ur.admin_campus_id = uc.campus_id
      )
    )
$$;

create or replace function public.auto_approve_blackout_break_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.request_scope = 'blackout_dates' then
    new.status := 'approved';
    new.reviewed_by := null;
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.ministry_type := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists auto_approve_blackout_break_request on public.break_requests;
create trigger auto_approve_blackout_break_request
before insert or update on public.break_requests
for each row
execute function public.auto_approve_blackout_break_request();

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
        'userIds', recipient_user_ids
      )
    );
  end if;

  return new;
exception when others then
  raise warning 'notify_break_request_created failed: %', sqlerrm;
  return new;
end;
$function$;

update public.break_requests
set
  status = 'approved',
  reviewed_by = null,
  reviewed_at = coalesce(reviewed_at, now()),
  ministry_type = null
where request_scope = 'blackout_dates'
  and status <> 'approved';
