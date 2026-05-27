create or replace function public.current_request_resource_app_key()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-resource-app-key',
    ''
  )
$$;

create or replace function public.request_matches_resource_app(_resource_app_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_request_resource_app_key() = _resource_app_key, false)
$$;

create or replace function public.is_life_group_admin(_user_id uuid, _resource_app_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.request_matches_resource_app(_resource_app_key)
    and public.is_student_resource_app_admin(_user_id, _resource_app_key)
$$;

create or replace function public.can_access_life_group(_user_id uuid, _group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.life_groups lg
    where lg.id = _group_id
      and public.request_matches_resource_app(lg.resource_app_key)
      and (
        public.is_student_resource_app_admin(_user_id, lg.resource_app_key)
        or public.is_life_group_leader(_user_id, lg.id)
      )
  )
$$;
