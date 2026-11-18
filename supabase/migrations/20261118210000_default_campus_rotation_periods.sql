-- New campuses get the same T1–T3 year the other campuses already use.
-- T1 is January–April, T2 is May–August, and T3 is September–December.

create or replace function public.seed_campus_rotation_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  period_year int;
  trimester_number int;
  period_start date;
  period_end date;
  today date := (now() at time zone 'America/Chicago')::date;
begin
  if coalesce(new.is_network_wide, false) then
    return new;
  end if;

  for period_year in (extract(year from today))::int .. (extract(year from today))::int + 1 loop
    for trimester_number in 1..3 loop
      period_start := case trimester_number
        when 1 then make_date(period_year, 1, 1)
        when 2 then make_date(period_year, 5, 1)
        else make_date(period_year, 9, 1)
      end;
      period_end := case trimester_number
        when 1 then make_date(period_year, 4, 30)
        when 2 then make_date(period_year, 8, 31)
        else make_date(period_year, 12, 31)
      end;

      insert into public.rotation_periods (
        name, year, trimester, start_date, end_date, is_active, campus_id
      )
      values (
        format('T%s %s', trimester_number, period_year),
        period_year,
        trimester_number,
        period_start,
        period_end,
        today between period_start and period_end,
        new.id
      )
      on conflict (year, trimester, campus_id) do nothing;
    end loop;
  end loop;

  return new;
end;
$$;

drop trigger if exists campuses_seed_rotation_periods on public.campuses;
create trigger campuses_seed_rotation_periods
after insert on public.campuses
for each row
execute function public.seed_campus_rotation_periods();

insert into public.rotation_periods (name, year, trimester, start_date, end_date, is_active, campus_id)
select
  format('T%s %s', trimester_number, period_year),
  period_year,
  trimester_number,
  case trimester_number
    when 1 then make_date(period_year, 1, 1)
    when 2 then make_date(period_year, 5, 1)
    else make_date(period_year, 9, 1)
  end,
  case trimester_number
    when 1 then make_date(period_year, 4, 30)
    when 2 then make_date(period_year, 8, 31)
    else make_date(period_year, 12, 31)
  end,
  (now() at time zone 'America/Chicago')::date between
    case trimester_number
      when 1 then make_date(period_year, 1, 1)
      when 2 then make_date(period_year, 5, 1)
      else make_date(period_year, 9, 1)
    end
    and
    case trimester_number
      when 1 then make_date(period_year, 4, 30)
      when 2 then make_date(period_year, 8, 31)
      else make_date(period_year, 12, 31)
    end,
  campuses.id
from public.campuses
cross join generate_series(
  extract(year from (now() at time zone 'America/Chicago'))::int,
  extract(year from (now() at time zone 'America/Chicago'))::int + 1
) as period_year
cross join generate_series(1, 3) as trimester_number
where coalesce(campuses.is_network_wide, false) = false
  and not exists (
    select 1
    from public.rotation_periods existing
    where existing.campus_id = campuses.id
  )
on conflict (year, trimester, campus_id) do nothing;
