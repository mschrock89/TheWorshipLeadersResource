-- 2027 trimesters follow the same campus set and date pattern as 2026 so
-- break requests and blackout dates can target next year.

insert into public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
select
  format('T%s %s', source.trimester, 2027),
  2027,
  source.trimester,
  case source.trimester
    when 1 then date '2027-01-01'
    when 2 then date '2027-05-01'
    else date '2027-09-01'
  end,
  case source.trimester
    when 1 then date '2027-04-30'
    when 2 then date '2027-08-31'
    else date '2027-12-31'
  end,
  false,
  source.campus_id
from (
  select distinct campus_id, trimester
  from public.rotation_periods
  where year = 2026
) as source
where not exists (
  select 1
  from public.rotation_periods existing
  where existing.year = 2027
    and existing.trimester = source.trimester
    and existing.campus_id is not distinct from source.campus_id
);
