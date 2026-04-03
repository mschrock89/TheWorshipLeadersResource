insert into public.worship_teams (name, color, icon)
select 'Simple Worship', '#22c55e', 'heart'
where not exists (
  select 1
  from public.worship_teams
  where lower(name) = lower('Simple Worship')
);

insert into public.worship_teams (name, color, icon)
select '5th Sunday', '#f59e0b', 'diamond'
where not exists (
  select 1
  from public.worship_teams
  where lower(name) = lower('5th Sunday')
);
