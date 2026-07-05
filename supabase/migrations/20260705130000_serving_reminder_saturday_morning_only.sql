-- Send the "You're Serving" reminder only on Saturday mornings.
--
-- Previously run_schedule_reminder fired at 8:00 AM every day that had schedule
-- rows, so Sunday servers got a day-of push on Sunday morning. The reminder now
-- goes out once, Saturday at 8:00 AM church-local time, and the edge function
-- covers the whole weekend: Saturday assignments as "today" and Sunday
-- assignments as "tomorrow".

create or replace function public.run_schedule_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  local_dow int;
  local_hour int;
  local_minute int;
  supabase_url text;
  service_key text;
begin
  local_now := timezone('America/Chicago', now());
  local_dow := extract(dow from local_now);
  local_hour := extract(hour from local_now);
  local_minute := extract(minute from local_now);

  -- Send once per week at 8:00 AM America/Chicago on Saturday (dow 6).
  if local_dow <> 6 or local_hour <> 8 or local_minute <> 0 then
    return;
  end if;

  select c.supabase_url, c.service_key
  into supabase_url, service_key
  from public.push_dispatch_config('run_schedule_reminder') c;

  if supabase_url is null or service_key is null then
    return;
  end if;

  perform net.http_post(
    url := supabase_url || '/functions/v1/notify-schedule-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := '{}'::jsonb
  );
end;
$$;
