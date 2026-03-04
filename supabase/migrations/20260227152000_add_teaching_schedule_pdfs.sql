alter table public.teaching_weeks
  add column if not exists schedule_pdf_path text;

insert into storage.buckets (id, name, public)
values ('teaching_schedules', 'teaching_schedules', false)
on conflict (id) do nothing;

create policy "Authenticated users can read teaching schedules"
on storage.objects
for select
to authenticated
using (bucket_id = 'teaching_schedules');

create policy "Staff can upload teaching schedules"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'teaching_schedules'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);

create policy "Staff can update teaching schedules"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'teaching_schedules'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
)
with check (
  bucket_id = 'teaching_schedules'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);

create policy "Staff can delete teaching schedules"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'teaching_schedules'
  and (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'campus_admin'::app_role)
    or has_role(auth.uid(), 'network_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_worship_pastor'::app_role)
    or has_role(auth.uid(), 'student_worship_pastor'::app_role)
    or has_role(auth.uid(), 'campus_pastor'::app_role)
  )
);
