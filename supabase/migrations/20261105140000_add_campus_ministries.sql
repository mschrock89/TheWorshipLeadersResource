-- Which ministries a physical campus actually runs.
-- A campus with no rows still offers every ministry. Saving a campus writes
-- this list, and pickers then follow it.

create table public.campus_ministries (
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null,
  created_at timestamptz not null default now(),
  primary key (campus_id, ministry_type)
);

create index campus_ministries_ministry_type_idx
  on public.campus_ministries (ministry_type);

alter table public.campus_ministries enable row level security;

create policy "Authenticated users can view campus ministries"
on public.campus_ministries
for select
to authenticated
using (true);

create policy "Admins can manage campus ministries"
on public.campus_ministries
for all
to authenticated
using (has_role(auth.uid(), 'admin'::app_role))
with check (has_role(auth.uid(), 'admin'::app_role));

notify pgrst, 'reload schema';
