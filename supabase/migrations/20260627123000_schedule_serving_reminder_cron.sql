-- Wire up the previously-orphaned "Serving Today" reminder to a pg_cron job.
-- Mirrors the run_google_calendar_weekly_resync pattern: the cron fires hourly
-- and the wrapper guards on the church-local hour so we don't have to chase DST
-- when scheduling in UTC.

create or replace function public.run_schedule_reminder()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_now timestamp;
  local_hour int;
  local_minute int;
  supabase_url text;
  service_key text;
begin
  local_now := timezone('America/Chicago', now());
  local_hour := extract(hour from local_now);
  local_minute := extract(minute from local_now);

  -- Send once per day at 8:00 AM America/Chicago.
  if local_hour <> 8 or local_minute <> 0 then
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

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'serving-today-reminder'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'serving-today-reminder',
    '0 * * * *',
    $cron$select public.run_schedule_reminder();$cron$
  );
end
$$;
