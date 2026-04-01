alter table public.worship_teams
add column if not exists template_config jsonb not null default '{}'::jsonb;
