-- Admin Tools signature tracker: everyone expected to sign the app's active
-- covenant, with their signature (if any), so admins can see who has signed
-- and what share of the team that is.
--
-- "Expected to sign" means the person belongs to the covenant's app through any
-- of: a team assignment (user_ministry_campuses) whose ministry type maps to
-- that app, a leadership role for that ministry, or a hub ministry membership.
-- Anyone who already signed is included even if none of those apply.
-- Student ministry types mirror src/lib/studentFlow.ts; every other team type
-- belongs to the Worship app.

create or replace function public.get_covenant_signature_roster(_document_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  campus_names text[],
  typed_name text,
  signed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  doc_app_key text;
  student_types constant text[] := array[
    'encounter', 'eon', 'eon_weekend', 'ms_hs', 'ms_hs_production', 'hs_production', 'students',
    'student_camp', 'student_camp_morning', 'student_camp_evening', 'student_camp_afternoon'
  ];
  app_types text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in to view covenant signatures.';
  end if;

  select cd.resource_app_key into doc_app_key
  from public.covenant_documents cd
  where cd.id = _document_id;

  if doc_app_key is null then
    raise exception 'Covenant document not found.';
  end if;

  if doc_app_key <> coalesce(public.current_request_resource_app_key(), 'worship') then
    raise exception 'That covenant belongs to a different app.';
  end if;

  if not (
    public.has_capability(auth.uid(), 'admin_full', doc_app_key)
    or public.has_capability(auth.uid(), 'admin_tools', doc_app_key)
  ) then
    raise exception 'Only admins can view covenant signatures.';
  end if;

  app_types := case doc_app_key
    when 'students_hs' then array[
      'encounter', 'ms_hs', 'ms_hs_production', 'hs_production', 'students',
      'student_camp', 'student_camp_morning', 'student_camp_evening', 'student_camp_afternoon'
    ]
    when 'students_ms' then array[
      'eon', 'eon_weekend', 'ms_hs', 'ms_hs_production', 'students',
      'student_camp', 'student_camp_morning', 'student_camp_evening', 'student_camp_afternoon'
    ]
    else null
  end;

  return query
  with expected as (
    select umc.user_id
    from public.user_ministry_campuses umc
    where case
      when app_types is null then umc.ministry_type <> 'audition' and not (umc.ministry_type = any(student_types))
      else umc.ministry_type = any(app_types)
    end
    union
    select ur.user_id
    from public.user_roles ur
    where (doc_app_key = 'worship' and ur.role::text in ('network_worship_pastor', 'campus_worship_pastor'))
       or (doc_app_key = 'students_hs' and ur.role::text in ('network_student_pastor', 'student_pastor', 'hs_leader'))
       or (doc_app_key = 'students_ms' and ur.role::text in ('network_student_pastor', 'student_pastor', 'ms_leader', 'ms_leader_weekend'))
    union
    select mm.user_id
    from public.ministry_memberships mm
    join public.ministries m on m.key = mm.ministry_key
    where m.resource_app_key = doc_app_key
    union
    select cs.user_id
    from public.covenant_signatures cs
    where cs.document_id = _document_id
  )
  select
    p.id,
    p.full_name,
    p.email,
    p.avatar_url,
    coalesce(
      (
        select array_agg(c.name order by c.name)
        from public.user_campuses uc
        join public.campuses c on c.id = uc.campus_id
        where uc.user_id = p.id
      ),
      '{}'::text[]
    ),
    cs.typed_name,
    cs.signed_at
  from expected e
  join public.profiles p on p.id = e.user_id
  left join public.covenant_signatures cs
    on cs.document_id = _document_id
   and cs.user_id = p.id
  order by cs.signed_at is not null, lower(coalesce(p.full_name, p.email));
end;
$$;

revoke all on function public.get_covenant_signature_roster(uuid) from public;
revoke all on function public.get_covenant_signature_roster(uuid) from anon;
grant execute on function public.get_covenant_signature_roster(uuid) to authenticated;

notify pgrst, 'reload schema';
