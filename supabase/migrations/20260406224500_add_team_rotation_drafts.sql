create table if not exists public.team_rotation_drafts (
  id uuid not null default gen_random_uuid() primary key,
  rotation_period_id uuid not null references public.rotation_periods(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  ministry_type text not null,
  assignments jsonb not null default '[]'::jsonb,
  saved_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint team_rotation_drafts_rotation_period_id_campus_id_ministry_type_key
    unique (rotation_period_id, campus_id, ministry_type)
);

create index if not exists idx_team_rotation_drafts_rotation_period
  on public.team_rotation_drafts(rotation_period_id);

create index if not exists idx_team_rotation_drafts_campus_ministry
  on public.team_rotation_drafts(campus_id, ministry_type);

alter table public.team_rotation_drafts enable row level security;

create policy "Authenticated users can view team rotation drafts"
on public.team_rotation_drafts
for select
using (auth.uid() is not null);

create policy "Leaders can manage team rotation drafts"
on public.team_rotation_drafts
for all
using (has_role(auth.uid(), 'leader'::app_role))
with check (has_role(auth.uid(), 'leader'::app_role));

drop trigger if exists update_team_rotation_drafts_updated_at on public.team_rotation_drafts;
create trigger update_team_rotation_drafts_updated_at
before update on public.team_rotation_drafts
for each row
execute function public.update_updated_at_column();
