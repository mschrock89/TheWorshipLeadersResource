-- Scope covenant documents (a.k.a. "Leader Expectations" in the student apps) so
-- each resource app manages and signs its own document independently. Before this
-- change there was a single global active covenant shared across the Worship app
-- and the HS/MS student apps; publishing in one app replaced it everywhere.

alter table public.covenant_documents
  add column if not exists resource_app_key text not null default 'worship'
    references public.resource_apps(key) on delete restrict;

-- The previous active-document lookup assumed a single global active row. Replace
-- the global active index with one partitioned per resource app so each app can
-- keep its own active document.
drop index if exists public.covenant_documents_active_idx;
create index if not exists covenant_documents_app_active_idx
  on public.covenant_documents(resource_app_key, is_active, created_at desc);

-- Reads are scoped to the resource app that issued the request so each app only
-- ever sees its own covenant document (and therefore its own signatures).
drop policy if exists "Authenticated users can view covenant documents" on public.covenant_documents;
create policy "Authenticated users can view covenant documents"
on public.covenant_documents
for select
to authenticated
using (
  coalesce(public.current_request_resource_app_key(), 'worship') = resource_app_key
);

-- Org admins keep full control everywhere; student app admins (student pastors)
-- can manage the document for their own student app only.
drop policy if exists "Admins can manage covenant documents" on public.covenant_documents;
create policy "Admins can manage covenant documents"
on public.covenant_documents
for all
to authenticated
using (
  public.is_student_resource_app_admin(auth.uid(), resource_app_key)
  and coalesce(public.current_request_resource_app_key(), 'worship') = resource_app_key
)
with check (
  public.is_student_resource_app_admin(auth.uid(), resource_app_key)
  and coalesce(public.current_request_resource_app_key(), 'worship') = resource_app_key
);

-- Allow student app admins (not just org admins) to upload/replace the stored PDF.
drop policy if exists "Admins can upload covenant documents storage" on storage.objects;
create policy "Admins can upload covenant documents storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'covenant_documents'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

drop policy if exists "Admins can update covenant documents storage" on storage.objects;
create policy "Admins can update covenant documents storage"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'covenant_documents'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
)
with check (
  bucket_id = 'covenant_documents'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

drop policy if exists "Admins can delete covenant documents storage" on storage.objects;
create policy "Admins can delete covenant documents storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'covenant_documents'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);
