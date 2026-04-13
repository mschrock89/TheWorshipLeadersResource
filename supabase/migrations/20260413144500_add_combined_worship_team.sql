insert into public.worship_teams (name, color, icon)
select 'Combined', '#38bdf8', 'users'
where not exists (
  select 1
  from public.worship_teams
  where lower(name) = lower('Combined')
);
