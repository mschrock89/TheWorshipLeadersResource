create table if not exists public.camp_attachments (
  id uuid primary key default gen_random_uuid(),
  camp_instance_id uuid not null references public.camp_instances(id) on delete cascade,
  title text not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint,
  audience text not null default 'everyone' check (audience in ('everyone', 'ms', 'hs', 'leaders')),
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(title) <> ''),
  check (btrim(file_path) <> '')
);

create index if not exists camp_attachments_camp_sort_idx
  on public.camp_attachments(camp_instance_id, is_published, sort_order, created_at);

alter table public.camp_attachments enable row level security;

drop policy if exists "Camp members can view published camp attachments" on public.camp_attachments;
create policy "Camp members can view published camp attachments"
on public.camp_attachments
for select
using (
  is_published = true
  and public.user_can_access_camp_instance(auth.uid(), camp_instance_id)
);

drop policy if exists "Student admins can manage camp attachments" on public.camp_attachments;
create policy "Student admins can manage camp attachments"
on public.camp_attachments
for all
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::app_role)
  or public.has_role(auth.uid(), 'student_pastor'::app_role)
);

create or replace trigger update_camp_attachments_updated_at
before update on public.camp_attachments
for each row
execute function public.update_updated_at_column();

insert into storage.buckets (id, name, public)
values ('camp_files', 'camp_files', false)
on conflict (id) do nothing;

-- Files are stored under "{camp_instance_id}/..." so read access can be gated by
-- the same camp-access helper used everywhere else in Camp Mode.
drop policy if exists "Camp members can read camp files" on storage.objects;
create policy "Camp members can read camp files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'camp_files'
  and public.user_can_access_camp_instance(
    auth.uid(),
    nullif((storage.foldername(name))[1], '')::uuid
  )
);

drop policy if exists "Student admins can upload camp files" on storage.objects;
create policy "Student admins can upload camp files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'camp_files'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

drop policy if exists "Student admins can update camp files" on storage.objects;
create policy "Student admins can update camp files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'camp_files'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
)
with check (
  bucket_id = 'camp_files'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);

drop policy if exists "Student admins can delete camp files" on storage.objects;
create policy "Student admins can delete camp files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'camp_files'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'student_pastor'::app_role)
  )
);
