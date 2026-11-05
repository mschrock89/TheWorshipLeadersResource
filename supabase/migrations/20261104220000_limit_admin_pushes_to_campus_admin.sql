-- Org Admins and Campus Admins only receive admin-audience pushes
-- (setlist confirms, swap leader notices, break requests, unanswered-swap gaps)
-- for campuses they are a Campus Admin for. A home campus or ministry
-- assignment does not qualify. Network pastors who are not admins still
-- follow their campus assignments.

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
      when exists (
        select 1
        from public.user_roles ur
        where ur.user_id = _user_id
          and ur.role in ('admin', 'campus_admin')
      )
        then exists (select 1 from campus_admin_campuses where campus_id = _campus_id)
      when exists (
        select 1
        from public.user_roles ur
        where ur.user_id = _user_id
          and ur.role in ('network_worship_pastor', 'network_worship_leader')
      )
      and exists (select 1 from assigned)
        then exists (select 1 from assigned where campus_id = _campus_id)
      else true
    end;
$$;

revoke all on function public.admin_receives_campus_push(uuid, uuid) from public;
revoke all on function public.admin_receives_campus_push(uuid, uuid) from anon;
revoke all on function public.admin_receives_campus_push(uuid, uuid) from authenticated;

update public.push_notification_definitions
set recipients_description = 'Campus Admins for that campus who oversee the ministry. Org Admins are included only when they are a Campus Admin there.'
where key = 'setlist-confirmed';
