create or replace function public.user_can_access_chat(
  _user_id uuid,
  _campus_id uuid,
  _ministry_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    has_role(_user_id, 'admin'::app_role)
    or exists (
      select 1
      from public.user_ministry_campuses umc
      where umc.user_id = _user_id
        and umc.campus_id = _campus_id
        and public.normalize_chat_ministry_type(umc.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
        and exists (
          select 1
          from public.user_campus_ministry_positions ucmp
          where ucmp.user_id = umc.user_id
            and ucmp.campus_id = umc.campus_id
            and public.normalize_chat_ministry_type(ucmp.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
            and ucmp.position <> 'drum_tech'
        )
    );
$$;

create or replace function public.get_profiles_for_chat_mention(
  _campus_id uuid,
  _ministry_type text
)
returns table(id uuid, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.full_name, p.avatar_url
  from public.profiles p
  inner join public.user_ministry_campuses umc
    on umc.user_id = p.id
  where umc.campus_id = _campus_id
    and public.normalize_chat_ministry_type(umc.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
    and exists (
      select 1
      from public.user_campus_ministry_positions ucmp
      where ucmp.user_id = umc.user_id
        and ucmp.campus_id = umc.campus_id
        and public.normalize_chat_ministry_type(ucmp.ministry_type) = public.normalize_chat_ministry_type(_ministry_type)
        and ucmp.position <> 'drum_tech'
    )
  order by p.full_name;
$$;
