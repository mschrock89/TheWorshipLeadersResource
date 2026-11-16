-- Signature tracker only counts worship volunteers:
--   HS students  -> HS Worship and MS/HS Worship
--   MS students  -> MS Worship, MS Worship Weekend, and MS/HS Worship
--   Weekend Worship and Evident stay on the Worship app, which also includes
--   the HS and MS worship teams above.
-- Production, video, speakers, camps, and student hospitality teams are excluded.
-- Someone is included only when they have a team assignment in one of those
-- ministries, not because they lead the ministry or already signed.

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
    when 'students_hs' then array['encounter', 'ms_hs']
    when 'students_ms' then array['eon', 'eon_weekend', 'ms_hs']
    else array[
      'weekend', 'weekend_team', 'sunday_am',
      'evident',
      'encounter', 'eon', 'eon_weekend', 'ms_hs'
    ]
  end;

  return query
  with expected as (
    select distinct umc.user_id
    from public.user_ministry_campuses umc
    where umc.ministry_type = any(app_types)
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
