-- Organization Admins can clear every signature on the current app's covenant
-- so the team has to sign that same document again. Student pastors can publish
-- a document, but they cannot wipe signatures. There is no table DELETE policy;
-- this function is the only path, and it checks the admin role itself.

create or replace function public.reset_covenant_signatures(_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  doc_app_key text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to reset covenant signatures.';
  end if;
  if not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Only organization admins can reset covenant signatures.';
  end if;

  select resource_app_key into doc_app_key
  from public.covenant_documents
  where id = _document_id;

  if doc_app_key is null then
    raise exception 'Covenant document not found.';
  end if;

  if doc_app_key <> coalesce(public.current_request_resource_app_key(), 'worship') then
    raise exception 'That covenant belongs to a different app.';
  end if;

  delete from public.covenant_signatures
  where document_id = _document_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.reset_covenant_signatures(uuid) from public;
revoke all on function public.reset_covenant_signatures(uuid) from anon;
grant execute on function public.reset_covenant_signatures(uuid) to authenticated;

notify pgrst, 'reload schema';
